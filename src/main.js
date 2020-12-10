const { readdir, lstat } = require('fs')
const { join, resolve, dirname, basename, extname } = require('path')
const { promisify } = require('util')

const cpFile = require('cp-file')
const locatePath = require('locate-path')
const makeDir = require('make-dir')
const pMap = require('p-map')

const { binaryRuntime, zipBinary } = require('./binary')
const { listNodeFiles } = require('./dependencies')
const { zipNodeJs } = require('./node')

const pReaddir = promisify(readdir)
const pLstat = promisify(lstat)

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function(srcFolder, destFolder, { parallelLimit = 5, skipGo, zipGo } = {}) {
  const srcPaths = await getSrcPaths(srcFolder)

  const zipped = await pMap(srcPaths, srcPath => zipFunction(srcPath, destFolder, { skipGo, zipGo }), {
    concurrency: parallelLimit
  })
  return zipped.filter(Boolean)
}

const zipFunction = async function(srcPath, destFolder, { skipGo = true, zipGo = !skipGo } = {}) {
  const { runtime, filename, extension, srcDir, stat, mainFile } = await getFunctionInfo(srcPath)

  if (runtime === undefined) {
    return
  }

  const srcFiles = await getSrcFiles({ runtime, stat, mainFile, extension, srcPath, srcDir })

  await makeDir(destFolder)

  if (runtime === 'js') {
    if (extension === '.zip') {
      const destPath = join(destFolder, filename)
      await cpFile(srcPath, destPath)
      return { path: destPath, runtime }
    } else {
      const destPath = join(destFolder, `${basename(filename, '.js')}.zip`)
      await zipNodeJs(srcFiles, destPath, filename, mainFile)
      return { path: destPath, runtime }
    }
  }

  if (runtime === 'go') {
    if (zipGo) {
      const destPath = join(destFolder, `${filename}.zip`)
      await zipBinary(srcPath, destPath, filename, stat, runtime)
      return { path: destPath, runtime }
    } else {
      const destPath = join(destFolder, filename)
      await cpFile(srcPath, destPath)
      return { path: destPath, runtime }
    }
  }

  if (runtime === 'rs') {
    // Rust functions must always be zipped.
    // The name of the binary inside the zip file must
    // always be `bootstrap` because they include the
    // Lambda runtime, and that's the name that AWS
    // expects for those kind of functions.
    const destPath = join(destFolder, `${filename}.zip`)
    await zipBinary(srcPath, destPath, 'bootstrap', stat, runtime)
    return { path: destPath, runtime }
  }
}

// List all Netlify Functions main entry files for a specific directory
const listFunctions = async function(srcFolder) {
  const functionInfos = await getFunctionInfos(srcFolder)
  const listedFunctions = functionInfos.map(getListedFunction)
  return listedFunctions
}

// List all Netlify Functions files for a specific directory
const listFunctionsFiles = async function(srcFolder) {
  const functionInfos = await getFunctionInfos(srcFolder)
  const listedFunctionsFiles = await Promise.all(functionInfos.map(getListedFunctionFiles))
  return [].concat(...listedFunctionsFiles)
}

const getFunctionInfos = async function(srcFolder) {
  const srcPaths = await getSrcPaths(srcFolder)
  const functionInfos = await Promise.all(srcPaths.map(getFunctionInfo))
  const functionInfosA = functionInfos.filter(hasMainFile)
  return functionInfosA
}

const getSrcPaths = async function(srcFolder) {
  const filenames = await listFilenames(srcFolder)
  const srcPaths = filenames.map(filename => resolve(srcFolder, filename))
  return srcPaths
}

const listFilenames = async function(srcFolder) {
  try {
    return await pReaddir(srcFolder)
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

const getFunctionInfo = async function(srcPath) {
  const { name, filename, stat, mainFile, extension, srcDir } = await getSrcInfo(srcPath)

  if (mainFile === undefined) {
    return {}
  }

  if (extension === '.zip' || extension === '.js') {
    return { runtime: 'js', name, filename, stat, mainFile, extension, srcPath, srcDir }
  }

  const runtime = await binaryRuntime(srcPath)
  if (runtime) {
    return { runtime, name, filename, stat, mainFile, extension, srcPath, srcDir }
  }

  return {}
}

const getSrcInfo = async function(srcPath) {
  const filename = basename(srcPath)
  if (filename === 'node_modules') {
    return {}
  }

  const stat = await pLstat(srcPath)
  const mainFile = await getMainFile(srcPath, filename, stat)
  if (mainFile === undefined) {
    return {}
  }

  const extension = extname(mainFile)
  const name = basename(srcPath, extname(srcPath))
  const srcDir = stat.isDirectory() ? srcPath : dirname(srcPath)
  return { name, filename, stat, mainFile, extension, srcDir }
}

// Each `srcPath` can also be a directory with an `index.js` file or a file
// using the same filename as its directory
const getMainFile = function(srcPath, filename, stat) {
  if (!stat.isDirectory()) {
    return srcPath
  }

  return locatePath([join(srcPath, `${filename}.js`), join(srcPath, 'index.js')], { type: 'file' })
}

const hasMainFile = function({ mainFile }) {
  return mainFile !== undefined
}

const getListedFunction = function({ runtime, name, mainFile, extension }) {
  return { name, mainFile, runtime, extension }
}

const getListedFunctionFiles = async function({ runtime, name, stat, mainFile, extension, srcPath, srcDir }) {
  const srcFiles = await getSrcFiles({ runtime, stat, mainFile, extension, srcPath, srcDir })
  return srcFiles.map(srcFile => ({ srcFile, name, mainFile, runtime, extension: extname(srcFile) }))
}

const getSrcFiles = function({ runtime, stat, mainFile, extension, srcPath, srcDir }) {
  if (runtime === 'js' && extension === '.js') {
    return listNodeFiles(srcPath, mainFile, srcDir, stat)
  }

  return [srcPath]
}

module.exports = { zipFunctions, zipFunction, listFunctions, listFunctionsFiles }
