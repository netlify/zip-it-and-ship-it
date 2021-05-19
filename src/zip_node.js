const { Buffer } = require('buffer')
const fs = require('fs')
const os = require('os')
const { basename, extname, join, normalize, resolve, sep } = require('path')
const { promisify } = require('util')

const copyFile = require('cp-file')
const deleteFiles = require('del')
const makeDir = require('make-dir')
const pMap = require('p-map')
const unixify = require('unixify')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')
const { ARCHIVE_FORMAT_ZIP } = require('./utils/consts')

const pStat = promisify(fs.stat)
const pWriteFile = promisify(fs.writeFile)

// Taken from https://www.npmjs.com/package/cpy.
const COPY_FILE_CONCURRENCY = os.cpus().length === 0 ? 2 : os.cpus().length * 2

const DEFAULT_USER_NAMESPACE = 'src'

const createDirectory = async function ({
  aliases = new Map(),
  basePath,
  destFolder,
  extension,
  filename,
  mainFile,
  pluginsModulesPath,
  srcFiles,
}) {
  const { contents: entryContents, filename: entryFilename } = getEntryFile({
    commonPrefix: basePath,
    filename,
    mainFile,
  })
  const functionFolder = join(destFolder, basename(filename, extension))

  // Deleting the functions directory in case it exists before creating it.
  await deleteFiles(functionFolder, { force: true })
  await makeDir(functionFolder)

  // Writing entry file.
  await pWriteFile(join(functionFolder, entryFilename), entryContents)

  // Copying source files.
  await pMap(
    srcFiles,
    (srcFile) => {
      const srcPath = aliases.get(srcFile) || srcFile
      const normalizedSrcPath = normalizeFilePath({ commonPrefix: basePath, path: srcPath, pluginsModulesPath })
      const destPath = join(functionFolder, normalizedSrcPath)

      return copyFile(srcFile, destPath)
    },
    { concurrency: COPY_FILE_CONCURRENCY },
  )

  return functionFolder
}

const createZipArchive = async function ({
  aliases,
  basePath,
  destFolder,
  extension,
  filename,
  mainFile,
  pluginsModulesPath,
  srcFiles,
}) {
  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)
  const { archive, output } = startZip(destPath)
  const entryFilename = `${basename(filename, extension)}.js`
  const entryFilePath = resolve(basePath, entryFilename)

  // We don't need an entry file if it would end up with the same path as the
  // function's main file.
  const needsEntryFile = entryFilePath !== mainFile

  // There is a naming conflict with the entry file if one of the supporting
  // files (i.e. not the main file) has the path that the entry file needs to
  // take.
  const hasEntryFileConflict = srcFiles.some((srcFile) => srcFile === entryFilePath && srcFile !== mainFile)

  // If there is a naming conflict, we move all user files (i.e. everything
  // other than the entry file) to its own namespace, which means its own
  // sub-directory.
  const userNamespace = hasEntryFileConflict ? DEFAULT_USER_NAMESPACE : ''

  if (needsEntryFile) {
    const entryFile = getEntryFile({ commonPrefix: basePath, filename, mainFile, userNamespace })

    addEntryFileToZip(archive, entryFile)
  }

  const srcFilesInfos = await Promise.all(srcFiles.map(addStat))

  // We ensure this is not async, so that the archive's checksum is
  // deterministic. Otherwise it depends on the order the files were added.
  srcFilesInfos.forEach(({ srcFile, stat }) => {
    zipJsFile({ srcFile, commonPrefix: basePath, pluginsModulesPath, archive, stat, aliases, userNamespace })
  })

  await endZip(archive, output)

  return destPath
}

const zipNodeJs = function ({ archiveFormat, ...options }) {
  if (archiveFormat === ARCHIVE_FORMAT_ZIP) {
    return createZipArchive(options)
  }

  return createDirectory(options)
}

const addEntryFileToZip = function (archive, { contents, filename }) {
  const contentBuffer = Buffer.from(contents)

  addZipContent(archive, contentBuffer, filename)
}

const addStat = async function (srcFile) {
  const stat = await pStat(srcFile)
  return { srcFile, stat }
}

const getEntryFile = ({ commonPrefix, filename, mainFile, userNamespace }) => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const extension = extname(filename)
  const entryFilename = `${basename(filename, extension)}.js`

  return {
    contents: `module.exports = require('./${mainPath}')`,
    filename: entryFilename,
  }
}

const zipJsFile = function ({
  srcFile,
  commonPrefix,
  pluginsModulesPath,
  archive,
  stat,
  aliases = new Map(),
  userNamespace,
}) {
  const filename = aliases.get(srcFile) || srcFile
  const normalizedFilename = normalizeFilePath({ commonPrefix, path: filename, pluginsModulesPath, userNamespace })

  addZipFile(archive, srcFile, normalizedFilename, stat)
}

// `adm-zip` and `require()` expect Unix paths.
// We remove the common path prefix.
// With files on different Windows drives, we remove the drive letter.
const normalizeFilePath = function ({ commonPrefix, path, pluginsModulesPath, userNamespace }) {
  const userNamespacePathSegment = userNamespace ? `${userNamespace}${sep}` : ''
  const pathA = normalize(path)
  const pathB =
    pluginsModulesPath === undefined
      ? pathA
      : pathA.replace(pluginsModulesPath, `${userNamespacePathSegment}node_modules`)
  const pathC = pathB.replace(commonPrefix, userNamespacePathSegment)
  const pathD = unixify(pathC)
  return pathD
}

module.exports = { zipNodeJs }
