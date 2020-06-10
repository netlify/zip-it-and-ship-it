const { readdir, lstat } = require('fs')
const { join, resolve, dirname, basename, extname } = require('path')

const cpFile = require('cp-file')
const locatePath = require('locate-path')
const makeDir = require('make-dir')
const pMap = require('p-map')
const promisify = require('util.promisify')

const { isGoExe, zipGoExe } = require('./go')
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

const zipFunction = async function(srcPath, destFolder, { skipGo = true, zipGo = !skipGo } = {}) {
  const { filename, stat, mainFile, extension, srcDir } = await getSrcInfo(srcPath)

  if (mainFile === undefined) {
    return
  }

  await makeDir(destFolder)

  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { path: destPath, runtime: 'js' }
  }

  if (extension === '.js') {
    const destPath = join(destFolder, `${basename(filename, '.js')}.zip`)
    await zipNodeJs(srcPath, srcDir, destPath, filename, mainFile, stat)
    return { path: destPath, runtime: 'js' }
  }

  const isGoExecutable = await isGoExe(srcPath)

  if (isGoExecutable && !zipGo) {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { path: destPath, runtime: 'go' }
  }

  if (isGoExecutable) {
    const destPath = join(destFolder, `${filename}.zip`)
    await zipGoExe(srcPath, destPath, filename, stat)
    return { path: destPath, runtime: 'go' }
  }
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
  const srcDir = stat.isDirectory() ? srcPath : dirname(srcPath)
  return { filename, stat, mainFile, extension, srcDir }
}

// Each `srcPath` can also be a directory with an `index.js` file or a file
// using the same filename as its directory
const getMainFile = function(srcPath, filename, stat) {
  if (!stat.isDirectory()) {
    return srcPath
  }

  return locatePath([join(srcPath, `${filename}.js`), join(srcPath, 'index.js')], { type: 'file' })
}

module.exports = { zipFunctions, zipFunction }
