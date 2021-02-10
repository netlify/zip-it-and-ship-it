const { readdir, lstat } = require('fs')
const { join, resolve, dirname, basename, extname } = require('path')
const { promisify } = require('util')

const locatePath = require('locate-path')

const { binaryRuntime } = require('./runtime')

const pReaddir = promisify(readdir)
const pLstat = promisify(lstat)

const getFunctionInfos = async function (srcFolder) {
  const srcPaths = await getSrcPaths(srcFolder)
  const functionInfos = await Promise.all(srcPaths.map(getFunctionInfo))
  const functionInfosA = functionInfos.filter(hasMainFile)
  return functionInfosA
}

const getSrcPaths = async function (srcFolder) {
  const filenames = await listFilenames(srcFolder)
  const srcPaths = filenames.map((filename) => resolve(srcFolder, filename))
  return srcPaths
}

const listFilenames = async function (srcFolder) {
  try {
    return await pReaddir(srcFolder)
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

const getFunctionInfo = async function (srcPath) {
  const { name, filename, stat, mainFile, extension, srcDir } = await getSrcInfo(srcPath)

  if (mainFile === undefined) {
    return {}
  }

  if (['.js', '.zip'].includes(extension)) {
    return { runtime: 'js', name, filename, stat, mainFile, extension, srcPath, srcDir }
  }

  const runtime = await binaryRuntime(srcPath)
  if (runtime) {
    return { runtime, name, filename, stat, mainFile, extension, srcPath, srcDir }
  }

  return {}
}

const getSrcInfo = async function (srcPath) {
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
const getMainFile = function (srcPath, filename, stat) {
  if (!stat.isDirectory()) {
    return srcPath
  }

  return locatePath([join(srcPath, `${filename}.js`), join(srcPath, 'index.js')], { type: 'file' })
}

const hasMainFile = function ({ mainFile }) {
  return mainFile !== undefined
}

module.exports = { getFunctionInfos, getSrcPaths, getFunctionInfo }
