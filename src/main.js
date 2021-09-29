const { extname } = require('path')

require('./utils/polyfills')
const { getFlags } = require('./feature_flags')
const { getPluginsModulesPath } = require('./node_dependencies')
const { getFunctionsFromPaths } = require('./runtimes')
const { listFunctionsDirectories, resolveFunctionsDirectories } = require('./utils/fs')
const { zipFunction, zipFunctions } = require('./zip')

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function (relativeSrcFolders, { featureFlags: inputFeatureFlags } = {}) {
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const paths = await listFunctionsDirectories(srcFolders)
  const functions = await getFunctionsFromPaths(paths, { featureFlags })
  const listedFunctions = [...functions.values()].map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function (relativeSrcFolders, { config, featureFlags: inputFeatureFlags } = {}) {
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const paths = await listFunctionsDirectories(srcFolders)
  const [functions, pluginsModulesPath] = await Promise.all([
    getFunctionsFromPaths(paths, { config, featureFlags }),
    getPluginsModulesPath(srcFolders[0]),
  ])
  const listedFunctionsFiles = await Promise.all(
    [...functions.values()].map((func) => getListedFunctionFiles(func, { featureFlags, pluginsModulesPath })),
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
  { featureFlags, pluginsModulesPath },
) {
  const srcFiles = await getSrcFiles({
    featureFlags,
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

const getSrcFiles = function ({
  bundler,
  config,
  featureFlags,
  runtime,
  stat,
  mainFile,
  extension,
  srcPath,
  srcDir,
  pluginsModulesPath,
}) {
  const { getSrcFiles: getRuntimeSrcFiles } = runtime

  if (extension === '.zip' || typeof getRuntimeSrcFiles !== 'function') {
    return [srcPath]
  }

  return getRuntimeSrcFiles({
    bundler,
    config,
    extension,
    featureFlags,
    srcPath,
    mainFile,
    srcDir,
    stat,
    pluginsModulesPath,
  })
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
