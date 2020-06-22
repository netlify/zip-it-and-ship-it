const { stat } = require('fs')
const { dirname, basename, normalize, sep } = require('path')

const commonPathPrefix = require('common-path-prefix')
const glob = require('glob')
const { not: notJunk } = require('junk')
const pkgDir = require('pkg-dir')
const unixify = require('unixify')
const promisify = require('util.promisify')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')
const { getDependencies } = require('./dependencies')

const pGlob = promisify(glob)
const pStat = promisify(stat)

// Zip a Node.js function file
const zipNodeJs = async function(srcPath, srcDir, destPath, filename, mainFile, stat) {
  const packageRoot = await pkgDir(srcDir)

  const files = await filesForFunctionZip(srcPath, filename, mainFile, packageRoot, stat)

  const { archive, output } = startZip(destPath)

  const dirnames = files.map(dirname)
  const commonPrefix = commonPathPrefix(dirnames)

  addEntryFile(commonPrefix, archive, filename, mainFile)

  await Promise.all(files.map(file => zipJsFile(file, commonPrefix, archive)))

  await endZip(archive, output)
}

// Retrieve the paths to the files to zip.
// We only include the files actually needed by the function because AWS Lambda
// has a size limit for the zipped file. It also makes cold starts faster.
const filesForFunctionZip = async function(srcPath, filename, mainFile, packageRoot, stat) {
  const [treeFiles, depFiles] = await Promise.all([getTreeFiles(srcPath, stat), getDependencies(mainFile, packageRoot)])
  const files = [...treeFiles, ...depFiles].map(normalize)
  const uniqueFiles = [...new Set(files)]
  const filteredFiles = uniqueFiles.filter(isNotJunk)
  return filteredFiles
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

// Remove temporary files like *~, *.swp, etc.
const isNotJunk = function(file) {
  return notJunk(basename(file))
}

const addEntryFile = function(commonPrefix, archive, filename, mainFile) {
  const mainPath = normalizeFilePath(mainFile, commonPrefix)
  const content = Buffer.from(`module.exports = require('./${mainPath}')`)
  const entryFilename = filename.endsWith('.js') ? filename : `${filename}.js`

  addZipContent(archive, content, entryFilename)
}

const zipJsFile = async function(file, commonPrefix, archive) {
  const filename = normalizeFilePath(file, commonPrefix)
  const stat = await pStat(file)
  addZipFile(archive, file, filename, stat)
}

// `adm-zip` and `require()` expect Unix paths.
// We remove the common path prefix.
// With files on different Windows drives, we remove the drive letter.
const normalizeFilePath = function(path, commonPrefix) {
  const pathA = normalize(path)
  const pathB = pathA.replace(commonPrefix, `${ZIP_ROOT_DIR}${sep}`)
  const pathC = unixify(pathB)
  return pathC
}

const ZIP_ROOT_DIR = 'src'

module.exports = { zipNodeJs }
