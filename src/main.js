const { readdir, lstat } = require('fs')
const { join, resolve, dirname, basename, extname } = require('path')

const cpFile = require('cp-file')
const makeDir = require('make-dir')
const pMap = require('p-map')
const pathExists = require('path-exists')
const promisify = require('util.promisify')

const { isGoExe, zipGoExe } = require('./go')
const { zipNodeJs } = require('./node')

const pReaddir = promisify(readdir)
const pLstat = promisify(lstat)

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function(srcFolder, destFolder, { parallelLimit = 5, skipGo, zipGo } = {}) {
  const filenames = await listFilenames(srcFolder)
  const srcPaths = filenames.map(filename => resolve(srcFolder, filename))

  const zipped = await pMap(srcPaths, srcPath => zipFunction(srcPath, destFolder, { skipGo, zipGo }), {
    concurrency: parallelLimit
  })
  return zipped.filter(Boolean)
}

const listFilenames = async function(srcFolder) {
  try {
    return await pReaddir(srcFolder)
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

const zipFunction = async function(srcPath, destFolder, { skipGo = true, zipGo = !skipGo } = {}) {
  const { filename, extension, srcDir, stat, handler, destPath, destCopyPath } = await statFile(srcPath, destFolder)

  if (filename === 'node_modules' || (stat.isDirectory() && handler === undefined)) {
    return
  }

  if (extension === '.zip') {
    await cpFile(srcPath, destCopyPath)
    return { path: destCopyPath, runtime: 'js' }
  }

  if (extension === '.js' || stat.isDirectory()) {
    await zipNodeJs(srcPath, srcDir, destPath, filename, handler, stat)
    return { path: destPath, runtime: 'js' }
  }

  const isGoExecutable = await isGoExe(srcPath)

  if (isGoExecutable && !zipGo) {
    await cpFile(srcPath, destCopyPath)
    return { path: destCopyPath, runtime: 'go' }
  }

  if (isGoExecutable) {
    await zipGoExe(srcPath, destPath, filename, stat)
    return { path: destPath, runtime: 'go' }
  }
}

const statFile = async function(srcPath, destFolder) {
  const filename = basename(srcPath)
  const extension = extname(srcPath)
  const stat = await pLstat(srcPath)
  const handler = await getHandler(srcPath, filename, stat)
  const srcDir = stat.isDirectory() ? srcPath : dirname(srcPath)

  await makeDir(destFolder)
  const destCopyPath = join(destFolder, filename)
  const destPath = join(destFolder, `${filename.replace(FUNCTION_EXTENSIONS, '')}.zip`)

  return {
    filename,
    extension,
    srcDir,
    stat,
    handler,
    destCopyPath,
    destPath
  }
}

// Each `srcPath` can also be a directory with an `index.js` file or a file
// using the same filename as its directory
const getHandler = async function(srcPath, filename, stat) {
  if (!stat.isDirectory()) {
    return srcPath
  }

  const namedHandler = join(srcPath, `${filename}.js`)
  if (await pathExists(namedHandler)) {
    return namedHandler
  }

  const indexHandler = join(srcPath, 'index.js')
  if (await pathExists(indexHandler)) {
    return indexHandler
  }
}

const FUNCTION_EXTENSIONS = /\.js$/

module.exports = { zipFunctions, zipFunction }
