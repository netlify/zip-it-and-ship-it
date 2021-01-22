const { join, basename, extname } = require('path')

const cpFile = require('cp-file')
const findUp = require('find-up')
const makeDir = require('make-dir')
const pMap = require('p-map')

const { getFunctionInfos, getSrcPaths, getFunctionInfo } = require('./info')
const { listNodeFiles } = require('./node_dependencies')
const { zipBinary } = require('./runtime')
const { zipNodeJs } = require('./zip_node')

const AUTO_PLUGINS_DIR = '.netlify/plugins/'

const getPluginsModulesPath = (srcDir) => findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function (
  srcFolder,
  destFolder,
  { parallelLimit = DEFAULT_PARALLEL_LIMIT, skipGo, zipGo } = {},
) {
  const [srcPaths, pluginsModulesPath] = await Promise.all([getSrcPaths(srcFolder), getPluginsModulesPath(srcFolder)])

  const zipped = await pMap(
    srcPaths,
    (srcPath) => zipFunction(srcPath, destFolder, { skipGo, zipGo, pluginsModulesPath }),
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
  { skipGo = true, zipGo = !skipGo, pluginsModulesPath: defaultModulesPath } = {},
) {
  const { runtime, filename, extension, srcDir, stat, mainFile } = await getFunctionInfo(srcPath)

  if (runtime === undefined) {
    return
  }

  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath
  const srcFiles = await getSrcFiles({ runtime, stat, mainFile, extension, srcPath, srcDir, pluginsModulesPath })

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
  })
  return { path: destPath, runtime }
}

const zipJsFunction = async function ({
  srcPath,
  destFolder,
  mainFile,
  filename,
  extension,
  srcFiles,
  pluginsModulesPath,
}) {
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return destPath
  }

  const destPath = join(destFolder, `${basename(filename, '.js')}.zip`)
  await zipNodeJs({ srcFiles, destPath, filename, mainFile, pluginsModulesPath })
  return destPath
}

const zipGoFunction = async function ({ srcPath, destFolder, stat, zipGo, filename, runtime }) {
  if (zipGo) {
    const destPath = join(destFolder, `${filename}.zip`)
    await zipBinary({ srcPath, destPath, filename, stat, runtime })
    return destPath
  }

  const destPath = join(destFolder, filename)
  await cpFile(srcPath, destPath)
  return destPath
}

// Rust functions must always be zipped.
// The name of the binary inside the zip file must
// always be `bootstrap` because they include the
// Lambda runtime, and that's the name that AWS
// expects for those kind of functions.
const zipRustFunction = async function ({ srcPath, destFolder, stat, filename, runtime }) {
  const destPath = join(destFolder, `${filename}.zip`)
  await zipBinary({ srcPath, destPath, filename: 'bootstrap', stat, runtime })
  return destPath
}

const RUNTIMES = {
  js: zipJsFunction,
  go: zipGoFunction,
  rs: zipRustFunction,
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

const getSrcFiles = function ({ runtime, stat, mainFile, extension, srcPath, srcDir, pluginsModulesPath }) {
  if (runtime === 'js' && extension === '.js') {
    return listNodeFiles({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })
  }

  return [srcPath]
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
