import { lstat, readdir, readFile, stat, unlink, writeFile } from 'fs'
import { format, join, parse, resolve } from 'path'
import { promisify } from 'util'

const pLstat = promisify(lstat)
const pReaddir = promisify(readdir)
const pReadFile = promisify(readFile)
const pStat = promisify(stat)
const pUnlink = promisify(unlink)
const pWriteFile = promisify(writeFile)

// This caches multiple FS calls to the same path. It creates a cache key with
// the name of the function and the path (e.g. "readdir:/some/directory").
const makeCachedFunction =
  <Args extends unknown[], ReturnType>(func: (path: string, ...args: Args) => ReturnType) =>
  (cache: Record<string, ReturnType>, path: string, ...args: Args): ReturnType => {
    const key = `${func.name}:${path}`

    if (cache[key] === undefined) {
      // eslint-disable-next-line no-param-reassign
      cache[key] = func(path, ...args)
    }

    return cache[key]
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
  const validDirectories = filenamesByDirectory.filter(Boolean)

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
}
