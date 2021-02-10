const { Buffer } = require('buffer')
const fs = require('fs')
const { basename, dirname, extname, join, normalize, sep } = require('path')
const { promisify } = require('util')

const commonPathPrefix = require('common-path-prefix')
const esbuild = require('esbuild')
const unixify = require('unixify')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')

const pStat = promisify(fs.stat)
const pUnlink = promisify(fs.unlink)

// Zip a Node.js function file
const zipNodeJs = async function ({
  destFolder,
  destPath,
  externalModules,
  filename,
  mainFile,
  pluginsModulesPath,
  srcFiles,
  useEsbuild,
}) {
  if (useEsbuild) {
    return zipNodeJsWithEsbuild({ destFolder, destPath, externalModules, filename, mainFile, pluginsModulesPath })
  }

  const { archive, output } = startZip(destPath)

  const dirnames = srcFiles.map(dirname)
  const commonPrefix = commonPathPrefix(dirnames)

  addEntryFile(commonPrefix, archive, filename, mainFile)

  const srcFilesInfos = await Promise.all(srcFiles.map(addStat))

  // We ensure this is not async, so that the archive's checksum is
  // deterministic. Otherwise it depends on the order the files were added.
  srcFilesInfos.forEach(({ srcFile, stat }) => {
    zipJsFile({ srcFile, commonPrefix, pluginsModulesPath, archive, stat })
  })

  await endZip(archive, output)
}

// Zip a Node.js function file with esbuild
const zipNodeJsWithEsbuild = async function ({
  destFolder,
  destPath,
  externalModules = [],
  filename,
  mainFile,
  pluginsModulesPath,
}) {
  const jsFilename = `${basename(filename, extname(filename))}.js`
  const bundledFilePath = join(destFolder, jsFilename)

  await esbuild.build({
    bundle: true,
    entryPoints: [mainFile],
    external: externalModules,
    outfile: bundledFilePath,
    platform: 'node',
    target: ['es2017'],
  })

  try {
    const { archive, output } = startZip(destPath)
    const { srcFile, stat } = await addStat(bundledFilePath)

    addEntryFile(destFolder, archive, jsFilename, bundledFilePath)

    zipJsFile({ archive, commonPrefix: destFolder, pluginsModulesPath, srcFile, stat })

    await endZip(archive, output)
  } finally {
    try {
      await pUnlink(bundledFilePath)
    } catch (_) {
      // no-op
    }
  }
}

const addEntryFile = function (commonPrefix, archive, filename, mainFile) {
  const mainPath = normalizeFilePath(mainFile, commonPrefix)
  const content = Buffer.from(`module.exports = require('./${mainPath}')`)
  const entryFilename = filename.endsWith('.js') ? filename : `${filename}.js`

  addZipContent(archive, content, entryFilename)
}

const addStat = async function (srcFile) {
  const stat = await pStat(srcFile)
  return { srcFile, stat }
}

const zipJsFile = function ({ srcFile, commonPrefix, pluginsModulesPath, archive, stat }) {
  const filename = normalizeFilePath(srcFile, commonPrefix, pluginsModulesPath)
  addZipFile(archive, srcFile, filename, stat)
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
