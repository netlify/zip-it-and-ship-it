const { extname } = require('path')

require('./utils/polyfills')
const { getFunctionInfos } = require('./info')
const { getPluginsModulesPath } = require('./node_dependencies')
const runtimes = require('./runtimes')
const { JS_BUNDLER_ZISI } = require('./utils/consts')
const { zipFunction, zipFunctions } = require('./zip')

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function (srcFolder) {
  const functionInfos = await getFunctionInfos(srcFolder)
  const listedFunctions = functionInfos.map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function (
  srcFolder,
  { jsBundler = JS_BUNDLER_ZISI, jsExternalModules, jsIgnoredModules } = {},
) {
  const [functionInfos, pluginsModulesPath] = await Promise.all([
    getFunctionInfos(srcFolder),
    getPluginsModulesPath(srcFolder),
  ])
  const listedFunctionsFiles = await Promise.all(
    functionInfos.map((info) =>
      getListedFunctionFiles(info, { jsBundler, jsExternalModules, jsIgnoredModules, pluginsModulesPath }),
    ),
  )
  // TODO: switch to Array.flat() once we drop support for Node.js < 11.0.0
  // eslint-disable-next-line unicorn/prefer-spread
  return [].concat(...listedFunctionsFiles)
}

const getListedFunction = function ({ runtime, name, mainFile, extension }) {
  return { name, mainFile, runtime, extension }
}

const getListedFunctionFiles = async function (
  { runtime, name, stat, mainFile, extension, srcPath, srcDir },
  { jsBundler, jsExternalModules, jsIgnoredModules, pluginsModulesPath },
) {
  const srcFiles = await getSrcFiles({
    runtime,
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
  })
  return srcFiles.map((srcFile) => ({ srcFile, name, mainFile, runtime, extension: extname(srcFile) }))
}

const getSrcFiles = function ({
  jsBundler,
  jsExternalModules,
  jsIgnoredModules,
  runtime,
  stat,
  mainFile,
  extension,
  srcPath,
  srcDir,
  pluginsModulesPath,
}) {
  const { getSrcFiles: getRuntimeSrcFiles } = runtimes[runtime]

  if (extension === '.zip' || typeof getRuntimeSrcFiles !== 'function') {
    return [srcPath]
  }

  return getRuntimeSrcFiles({
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
    extension,
    srcPath,
    mainFile,
    srcDir,
    stat,
    pluginsModulesPath,
  })
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
