import { Buffer } from 'buffer'
import { Stats, promises as fs } from 'fs'
import os from 'os'
import { basename, join } from 'path'

import { getPath as getV2APIPath } from '@netlify/serverless-functions-api'
import { copyFile } from 'cp-file'
import pMap from 'p-map'

import {
  startZip,
  addZipFile,
  addZipContent,
  endZip,
  ZipArchive,
  ArchiveFormat,
  ARCHIVE_FORMAT,
} from '../../../archive.js'
import type { FeatureFlags } from '../../../feature_flags.js'
import type { RuntimeCache } from '../../../utils/cache.js'
import { cachedLstat, mkdirAndWriteFile } from '../../../utils/fs.js'

import {
  BOOTSTRAP_FILE_NAME,
  conflictsWithEntryFile,
  EntryFile,
  getEntryFile,
  isNamedLikeEntryFile,
} from './entry_file.js'
import { ModuleFormat } from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

// Taken from https://www.npmjs.com/package/cpy.
const COPY_FILE_CONCURRENCY = os.cpus().length === 0 ? 2 : os.cpus().length * 2

// Sub-directory to place all user-defined files  (i.e. everything other than
// the entry file generated by zip-it-and-ship-it).
const DEFAULT_USER_SUBDIRECTORY = 'src'

interface ZipNodeParameters {
  aliases?: Map<string, string>
  basePath: string
  cache: RuntimeCache
  destFolder: string
  extension: string
  featureFlags: FeatureFlags
  filename: string
  mainFile: string
  moduleFormat: ModuleFormat
  rewrites?: Map<string, string>
  srcFiles: string[]
}

const createDirectory = async function ({
  aliases = new Map(),
  basePath,
  destFolder,
  extension,
  featureFlags,
  filename,
  mainFile,
  moduleFormat,
  rewrites = new Map(),
  srcFiles,
}: ZipNodeParameters) {
  const { contents: entryContents, filename: entryFilename } = getEntryFile({
    commonPrefix: basePath,
    featureFlags,
    filename,
    mainFile,
    moduleFormat,
    userNamespace: DEFAULT_USER_SUBDIRECTORY,
  })
  const functionFolder = join(destFolder, basename(filename, extension))

  // Deleting the functions directory in case it exists before creating it.
  await fs.rm(functionFolder, { recursive: true, force: true })
  await fs.mkdir(functionFolder, { recursive: true })

  // Writing entry file.
  await fs.writeFile(join(functionFolder, entryFilename), entryContents)

  // Copying source files.
  await pMap(
    srcFiles,
    (srcFile) => {
      const destPath = aliases.get(srcFile) || srcFile
      const normalizedDestPath = normalizeFilePath({
        commonPrefix: basePath,
        path: destPath,
        userNamespace: DEFAULT_USER_SUBDIRECTORY,
      })
      const absoluteDestPath = join(functionFolder, normalizedDestPath)

      if (rewrites.has(srcFile)) {
        return mkdirAndWriteFile(absoluteDestPath, rewrites.get(srcFile) as string)
      }

      return copyFile(srcFile, absoluteDestPath)
    },
    { concurrency: COPY_FILE_CONCURRENCY },
  )

  return functionFolder
}

const createZipArchive = async function ({
  aliases = new Map(),
  basePath,
  cache,
  destFolder,
  extension,
  featureFlags,
  filename,
  mainFile,
  moduleFormat,
  rewrites,
  srcFiles,
}: ZipNodeParameters) {
  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)
  const { archive, output } = startZip(destPath)

  // There is a naming conflict with the entry file if one of the supporting
  // files (i.e. not the main file) has the path that the entry file needs to
  // take.
  const hasEntryFileConflict = conflictsWithEntryFile(srcFiles, {
    basePath,
    extension,
    featureFlags,
    filename,
    mainFile,
  })

  // We don't need an entry file if it would end up with the same path as the
  // function's main file. Unless we have a file conflict and need to move everything into a subfolder
  const needsEntryFile =
    featureFlags.zisi_unique_entry_file ||
    featureFlags.zisi_functions_api_v2 ||
    hasEntryFileConflict ||
    !isNamedLikeEntryFile(mainFile, { basePath, featureFlags, filename })

  // If there is a naming conflict, we move all user files (everything other
  // than the entry file) to its own sub-directory.
  const userNamespace = hasEntryFileConflict ? DEFAULT_USER_SUBDIRECTORY : ''

  if (needsEntryFile) {
    const entryFile = getEntryFile({
      commonPrefix: basePath,
      filename,
      mainFile,
      moduleFormat,
      userNamespace,
      featureFlags,
    })

    addEntryFileToZip(archive, entryFile)
  }

  if (featureFlags.zisi_functions_api_v2) {
    // This is the path to the file that contains all the code for the v2
    // functions API. We add it to the list of source files and create an
    // alias so that it's written as `BOOTSTRAP_FILE_NAME` in the ZIP.
    const v2APIPath = getV2APIPath()

    srcFiles.push(v2APIPath)
    aliases.set(v2APIPath, BOOTSTRAP_FILE_NAME)
  }

  const srcFilesInfos = await Promise.all(srcFiles.map((file) => addStat(cache, file)))

  // We ensure this is not async, so that the archive's checksum is
  // deterministic. Otherwise it depends on the order the files were added.
  srcFilesInfos.forEach(({ srcFile, stat }) => {
    zipJsFile({
      aliases,
      archive,
      commonPrefix: basePath,
      rewrites,
      srcFile,
      stat,
      userNamespace,
    })
  })

  await endZip(archive, output)

  return destPath
}

export const zipNodeJs = function ({
  archiveFormat,
  ...options
}: ZipNodeParameters & { archiveFormat: ArchiveFormat }): Promise<string> {
  if (archiveFormat === ARCHIVE_FORMAT.ZIP) {
    return createZipArchive(options)
  }

  return createDirectory(options)
}

const addEntryFileToZip = function (archive: ZipArchive, { contents, filename }: EntryFile) {
  const contentBuffer = Buffer.from(contents)

  addZipContent(archive, contentBuffer, filename)
}

const addStat = async function (cache: RuntimeCache, srcFile: string) {
  const stat = await cachedLstat(cache.lstatCache, srcFile)

  return { srcFile, stat }
}

const zipJsFile = function ({
  aliases = new Map(),
  archive,
  commonPrefix,
  rewrites = new Map(),
  stat,
  srcFile,
  userNamespace,
}: {
  aliases?: Map<string, string>
  archive: ZipArchive
  commonPrefix: string
  rewrites?: Map<string, string>
  stat: Stats
  srcFile: string
  userNamespace: string
}) {
  const destPath = aliases.get(srcFile) || srcFile
  const normalizedDestPath = normalizeFilePath({ commonPrefix, path: destPath, userNamespace })

  if (rewrites.has(srcFile)) {
    addZipContent(archive, rewrites.get(srcFile) as string, normalizedDestPath)
  } else {
    addZipFile(archive, srcFile, normalizedDestPath, stat)
  }
}
