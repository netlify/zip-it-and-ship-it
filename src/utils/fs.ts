import { lstat, readdir, readFile, stat, unlink, writeFile } from 'fs'
import { dirname, format, join, parse, resolve } from 'path'
import { promisify } from 'util'

import makeDir from 'make-dir'

import { nonNullable } from './non_nullable'

const pLstat = promisify(lstat)
const pReaddir = promisify(readdir)
const pReadFile = promisify(readFile)
const pStat = promisify(stat)
const pUnlink = promisify(unlink)
const pWriteFile = promisify(writeFile)

type FsCache = Record<string, unknown>

// This caches multiple FS calls to the same path. It creates a cache key with
// the name of the function and the path (e.g. "readdir:/some/directory").
//
// TODO: This abstraction is stripping out some type data. For example, when
// calling `readFile` without an encoding, the return type should be narrowed
// down from `string | Buffer` to `Buffer`, but that's not happening.
const makeCachedFunction =
  <Args extends unknown[], ReturnType>(func: (path: string, ...args: Args) => ReturnType) =>
  (cache: FsCache, path: string, ...args: Args): ReturnType => {
    const key = `${func.name}:${path}`

    if (cache[key] === undefined) {
      // eslint-disable-next-line no-param-reassign
      cache[key] = func(path, ...args)
    }

    return cache[key] as ReturnType
  }

const cachedLstat = makeCachedFunction(pLstat)
const cachedReaddir = makeCachedFunction(pReaddir)
const cachedReadFile = makeCachedFunction(pReadFile)

const getPathWithExtension = (path: string, extension: string) =>
  format({ ...parse(path), base: undefined, ext: extension })

const safeUnlink = async (path: string) => {
  try {
    await pUnlink(path)
  } catch (_) {}
}

// Takes a list of absolute paths and returns an array containing all the
// filenames within those directories, if at least one of the directories
// exists. If not, an error is thrown.
const listFunctionsDirectories = async function (srcFolders: string[]) {
  const filenamesByDirectory = await Promise.all(
    srcFolders.map(async (srcFolder) => {
      try {
        const filenames = await listFunctionsDirectory(srcFolder)

        return filenames
      } catch (error) {
        return null
      }
    }),
  )
  const validDirectories = filenamesByDirectory.filter(nonNullable)

  if (validDirectories.length === 0) {
    throw new Error(`Functions folder does not exist: ${srcFolders.join(', ')}`)
  }

  return validDirectories.flat()
}

const listFunctionsDirectory = async function (srcFolder: string) {
  try {
    const filenames = await pReaddir(srcFolder)

    return filenames.map((name) => join(srcFolder, name))
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

const resolveFunctionsDirectories = (input: string | string[]) => {
  const directories = Array.isArray(input) ? input : [input]
  const absoluteDirectories = directories.map((srcFolder) => resolve(srcFolder))

  return absoluteDirectories
}

const mkdirAndWriteFile: typeof pWriteFile = async (path, ...params) => {
  if (typeof path === 'string') {
    const directory = dirname(path)

    await makeDir(directory)
  }

  return pWriteFile(path, ...params)
}

export {
  cachedLstat,
  cachedReaddir,
  cachedReadFile,
  pLstat as lstat,
  getPathWithExtension,
  listFunctionsDirectories,
  listFunctionsDirectory,
  resolveFunctionsDirectories,
  safeUnlink,
  pStat as stat,
  pWriteFile as writeFile,
  pReadFile as readFile,
  mkdirAndWriteFile,
}
export type { FsCache }
