import { promises as fs } from 'fs'
import { dirname, format, join, parse, resolve } from 'path'

import { nonNullable } from './non_nullable'

export type FsCache = Record<string, unknown>

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

export const cachedLstat = makeCachedFunction(fs.lstat)
export const cachedReaddir = makeCachedFunction(fs.readdir)
export const cachedReadFile = makeCachedFunction(fs.readFile)

export const getPathWithExtension = (path: string, extension: string) =>
  format({ ...parse(path), base: undefined, ext: extension })

export const safeUnlink = async (path: string) => {
  try {
    await fs.unlink(path)
  } catch {}
}

// Takes a list of absolute paths and returns an array containing all the
// filenames within those directories, if at least one of the directories
// exists. If not, an error is thrown.
export const listFunctionsDirectories = async function (srcFolders: string[]) {
  const filenamesByDirectory = await Promise.all(
    srcFolders.map(async (srcFolder) => {
      try {
        const filenames = await listFunctionsDirectory(srcFolder)

        return filenames
      } catch {
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

export const listFunctionsDirectory = async function (srcFolder: string) {
  try {
    const filenames = await fs.readdir(srcFolder)

    return filenames.map((name) => join(srcFolder, name))
  } catch {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

export const resolveFunctionsDirectories = (input: string | string[]) => {
  const directories = Array.isArray(input) ? input : [input]
  const absoluteDirectories = directories.map((srcFolder) => resolve(srcFolder))

  return absoluteDirectories
}

export const mkdirAndWriteFile: typeof fs.writeFile = async (path, ...params) => {
  if (typeof path === 'string') {
    const directory = dirname(path)

    await fs.mkdir(directory, { recursive: true })
  }

  return fs.writeFile(path, ...params)
}
