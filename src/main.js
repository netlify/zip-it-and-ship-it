const { extname, join } = require('path')

const cpFile = require('cp-file')
const findUp = require('find-up')
const makeDir = require('make-dir')
const pMap = require('p-map')

require('./utils/polyfills')
const { getFunctionInfos, getSrcPaths, getFunctionInfo } = require('./info')
const runtimes = require('./runtimes')
const { removeFalsy } = require('./utils/remove_falsy')

const AUTO_PLUGINS_DIR = '.netlify/plugins/'
const DEFAULT_PARALLEL_LIMIT = 5

const getPluginsModulesPath = (srcDir) => findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function (
  srcFolder,
  destFolder,
  {
    jsBundler,
    jsExternalModules = [],
    jsIgnoredModules = [],
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
    skipGo,
    zipGo,
  } = {},
) {
  const [srcPaths, pluginsModulesPath] = await Promise.all([getSrcPaths(srcFolder), getPluginsModulesPath(srcFolder)])

  const zipped = await pMap(
    srcPaths,
    (srcPath) =>
      zipFunction(srcPath, destFolder, {
        jsBundler,
        jsExternalModules,
        jsIgnoredModules,
        pluginsModulesPath,
        skipGo,
        zipGo,
      }),
    {
      concurrency: parallelLimit,
    },
  )
  return zipped.filter(Boolean)
}

const zipFunction = async function (
  srcPath,
  destFolder,
  {
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
    pluginsModulesPath: defaultModulesPath,
    skipGo = true,
    zipGo = !skipGo,
  } = {},
) {
  const { runtime, filename, extension, srcDir, stat, mainFile } = await getFunctionInfo(srcPath)

  if (runtime === undefined) {
    return
  }

  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath

  await makeDir(destFolder)

  // If the file is a zip, we assume the function is bundled and ready to go.
  // We assume its runtime to be JavaScript and simply copy it to the
  // destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { path: destPath, runtime: 'js' }
  }

  const { bundlerErrors, bundlerVersion, bundlerWarnings, path } = await runtimes[runtime].zipFunction({
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
    srcPath,
    destFolder,
    mainFile,
    filename,
    extension,
    srcDir,
    stat,
    zipGo,
    runtime,
    pluginsModulesPath,
  })
  return removeFalsy({ bundlerErrors, bundlerVersion, bundlerWarnings, path, runtime })
}

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function (srcFolder) {
  const functionInfos = await getFunctionInfos(srcFolder)
  const listedFunctions = functionInfos.map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function (srcFolder, { jsBundler, jsExternalModules, jsIgnoredModules } = {}) {
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
