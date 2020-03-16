const { lstat } = require('fs')
const { dirname } = require('path')

const pkgDir = require('pkg-dir')
const glob = require('glob')
const promisify = require('util.promisify')
const commonPathPrefix = require('common-path-prefix')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')
const { getDependencies } = require('./dependencies')

const pGlob = promisify(glob)
const pLstat = promisify(lstat)

// Zip a Node.js function file
const zipNodeJs = async function(srcPath, srcDir, destPath, filename, handler, stat) {
  const { archive, output } = startZip(destPath)

  const packageRoot = await pkgDir(srcDir)

  const files = await filesForFunctionZip(srcPath, filename, handler, packageRoot, stat)
  const dirnames = files.map(dirname)
  const commonPrefix = commonPathPrefix(dirnames)

  addEntryFile(srcPath, commonPrefix, archive, filename, handler)

  await Promise.all(files.map(file => zipJsFile(file, commonPrefix, archive)))

  await endZip(archive, output)
}

// Retrieve the paths to the files to zip.
// We only include the files actually needed by the function because AWS Lambda
// has a size limit for the zipped file. It also makes cold starts faster.
const filesForFunctionZip = async function(srcPath, filename, handler, packageRoot, stat) {
  const [treeFiles, depFiles] = await Promise.all([getTreeFiles(srcPath, stat), getDependencies(handler, packageRoot)])
  const files = [...treeFiles, ...depFiles]
  const uniqueFiles = [...new Set(files)]
  return uniqueFiles
}

// When using a directory, we include all its descendants except `node_modules`
const getTreeFiles = function(srcPath, stat) {
  if (!stat.isDirectory()) {
    return [srcPath]
  }

  return pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true
  })
}

const addEntryFile = function(srcPath, commonPrefix, archive, filename, handler) {
  const mainPath = handler.replace(commonPrefix, 'src/')
  const content = Buffer.from(`module.exports = require('./${mainPath}')`)
  const entryFilename = filename.endsWith('.js') ? filename : `${filename}.js`

  addZipContent(archive, content, entryFilename)
}

const zipJsFile = async function(file, commonPrefix, archive) {
  const filename = file.replace(commonPrefix, 'src/')
  const stat = await pLstat(file)
  addZipFile(archive, file, filename, stat)
}

module.exports = { zipNodeJs }
