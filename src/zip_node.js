const { Buffer } = require('buffer')
const fs = require('fs')
const { basename, extname, normalize, sep } = require('path')
const { promisify } = require('util')

const unixify = require('unixify')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')

const pStat = promisify(fs.stat)

// Zip a Node.js function file
const zipNodeJs = async function ({ basePath, destPath, filename, mainFile, pluginsModulesPath, aliases, srcFiles }) {
  const { archive, output } = startZip(destPath)

  addEntryFile(basePath, archive, filename, mainFile)

  const srcFilesInfos = await Promise.all(srcFiles.map(addStat))

  // We ensure this is not async, so that the archive's checksum is
  // deterministic. Otherwise it depends on the order the files were added.
  srcFilesInfos.forEach(({ srcFile, stat }) => {
    zipJsFile({ srcFile, commonPrefix: basePath, pluginsModulesPath, archive, stat, aliases })
  })

  await endZip(archive, output)
}

const addEntryFile = function (commonPrefix, archive, filename, mainFile) {
  const mainPath = normalizeFilePath(mainFile, commonPrefix)
  const content = Buffer.from(`module.exports = require('./${mainPath}')`)
  const extension = extname(filename)
  const entryFilename = `${basename(filename, extension)}.js`

  addZipContent(archive, content, entryFilename)
}

const addStat = async function (srcFile) {
  const stat = await pStat(srcFile)
  return { srcFile, stat }
}

const zipJsFile = function ({ srcFile, commonPrefix, pluginsModulesPath, archive, stat, aliases = {} }) {
  const filename = aliases[srcFile] || srcFile
  const normalizedFilename = normalizeFilePath(filename, commonPrefix, pluginsModulesPath)
  addZipFile(archive, srcFile, normalizedFilename, stat)
}

// `adm-zip` and `require()` expect Unix paths.
// We remove the common path prefix.
// With files on different Windows drives, we remove the drive letter.
const normalizeFilePath = function (path, commonPrefix, pluginsModulesPath) {
  const pathA = normalize(path)
  const pathB =
    pluginsModulesPath === undefined ? pathA : pathA.replace(pluginsModulesPath, `${ZIP_ROOT_DIR}${sep}node_modules`)
  const pathC = pathB.replace(commonPrefix, `${ZIP_ROOT_DIR}${sep}`)
  const pathD = unixify(pathC)
  return pathD
}

const ZIP_ROOT_DIR = 'src'

module.exports = { zipNodeJs }
