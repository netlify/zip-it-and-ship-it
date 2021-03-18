const { extname, resolve } = require('path')

require('./utils/polyfills')
const { getPluginsModulesPath } = require('./node_dependencies')
const { getFunctionsFromPaths } = require('./runtimes')
const { listFunctionsDirectory } = require('./utils/fs')
const { zipFunction, zipFunctions } = require('./zip')

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function (relativeSrcFolder) {
  const srcFolder = resolve(relativeSrcFolder)
  const paths = await listFunctionsDirectory(srcFolder)
  const functions = await getFunctionsFromPaths(paths)
  const listedFunctions = [...functions.values()].map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function (relativeSrcFolder, { config } = {}) {
  const srcFolder = resolve(relativeSrcFolder)
  const paths = await listFunctionsDirectory(srcFolder)
  const [functions, pluginsModulesPath] = await Promise.all([
    getFunctionsFromPaths(paths, { config }),
    getPluginsModulesPath(srcFolder),
  ])
  const listedFunctionsFiles = await Promise.all(
    [...functions.values()].map((func) => getListedFunctionFiles(func, { pluginsModulesPath })),
  )

  // TODO: switch to Array.flat() once we drop support for Node.js < 11.0.0
  // eslint-disable-next-line unicorn/prefer-spread
  return [].concat(...listedFunctionsFiles)
}

const getListedFunction = function ({ runtime, name, mainFile, extension }) {
  return { name, mainFile, runtime: runtime.name, extension }
}

const getListedFunctionFiles = async function (
  { config, runtime, name, stat, mainFile, extension, srcPath, srcDir },
  { pluginsModulesPath },
) {
  const srcFiles = await getSrcFiles({
    runtime,
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    config,
  })
  return srcFiles.map((srcFile) => ({ srcFile, name, mainFile, runtime: runtime.name, extension: extname(srcFile) }))
}

const getSrcFiles = function ({ config, runtime, stat, mainFile, extension, srcPath, srcDir, pluginsModulesPath }) {
  const { getSrcFiles: getRuntimeSrcFiles } = runtime

  if (extension === '.zip' || typeof getRuntimeSrcFiles !== 'function') {
    return [srcPath]
  }

  return getRuntimeSrcFiles({
    config,
    extension,
    srcPath,
    mainFile,
    srcDir,
    stat,
    pluginsModulesPath,
  })
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
