const { extname } = require('path')

const findUp = require('find-up')
const makeDir = require('make-dir')
const pMap = require('p-map')

const { getFunctionInfos, getSrcPaths, getFunctionInfo } = require('./info')
const { listNodeFiles } = require('./node_dependencies')
const RUNTIMES = require('./runtimes')

const AUTO_PLUGINS_DIR = '.netlify/plugins/'

const getPluginsModulesPath = (srcDir) => findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function (
  srcFolder,
  destFolder,
  { parallelLimit = DEFAULT_PARALLEL_LIMIT, skipGo, zipGo, useEsbuild, externalModules = [] } = {},
) {
  const [srcPaths, pluginsModulesPath] = await Promise.all([getSrcPaths(srcFolder), getPluginsModulesPath(srcFolder)])

  const zipped = await pMap(
    srcPaths,
    (srcPath) => zipFunction(srcPath, destFolder, { skipGo, zipGo, pluginsModulesPath, useEsbuild, externalModules }),
    {
      concurrency: parallelLimit,
    },
  )
  return zipped.filter(Boolean)
}

const DEFAULT_PARALLEL_LIMIT = 5

const zipFunction = async function (
  srcPath,
  destFolder,
  { skipGo = true, zipGo = !skipGo, pluginsModulesPath: defaultModulesPath, useEsbuild, externalModules } = {},
) {
  const { runtime, filename, extension, srcDir, stat, mainFile } = await getFunctionInfo(srcPath)

  if (runtime === undefined) {
    return
  }

  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath
  const srcFiles = await getSrcFiles({
    runtime,
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    useEsbuild,
    externalModules,
  })

  await makeDir(destFolder)

  const destPath = await RUNTIMES[runtime]({
    srcPath,
    destFolder,
    mainFile,
    filename,
    extension,
    srcFiles,
    stat,
    zipGo,
    runtime,
    pluginsModulesPath,
    useEsbuild,
    externalModules,
  })
  return { path: destPath, runtime }
}

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function (srcFolder) {
  const functionInfos = await getFunctionInfos(srcFolder)
  const listedFunctions = functionInfos.map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function (srcFolder) {
  const [functionInfos, pluginsModulesPath] = await Promise.all([
    getFunctionInfos(srcFolder),
    getPluginsModulesPath(srcFolder),
  ])
  const listedFunctionsFiles = await Promise.all(
    functionInfos.map((info) => getListedFunctionFiles(info, { pluginsModulesPath })),
  )
  return [].concat(...listedFunctionsFiles)
}

const getListedFunction = function ({ runtime, name, mainFile, extension }) {
  return { name, mainFile, runtime, extension }
}

const getListedFunctionFiles = async function (
  { runtime, name, stat, mainFile, extension, srcPath, srcDir },
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
  })
  return srcFiles.map((srcFile) => ({ srcFile, name, mainFile, runtime, extension: extname(srcFile) }))
}

const getSrcFiles = function ({ runtime, stat, mainFile, extension, srcPath, srcDir, pluginsModulesPath, useEsbuild }) {
  if (runtime === 'js' && extension === '.js') {
    if (useEsbuild) {
      return []
    }

    return listNodeFiles({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })
  }

  return [srcPath]
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
