const { lstat, readdir, readFile, unlink, writeFile } = require('fs')
const { format, join, parse, resolve } = require('path')
const { promisify } = require('util')

const pLstat = promisify(lstat)
const pReaddir = promisify(readdir)
const pReadFile = promisify(readFile)
const pUnlink = promisify(unlink)
const pWriteFile = promisify(writeFile)

// This caches multiple FS calls to the same path. It creates a cache key with
// the name of the function and the path (e.g. "readdir:/some/directory").
const cachedIOFunction = (func, cache, path, ...args) => {
  const key = `${func.name}:${path}`

  if (cache[key] === undefined) {
    // eslint-disable-next-line no-param-reassign
    cache[key] = func(path, ...args)
  }

  return cache[key]
}

const cachedLstat = (...args) => cachedIOFunction(pLstat, ...args)
const cachedReaddir = (...args) => cachedIOFunction(pReaddir, ...args)
const cachedReadFile = (...args) => cachedIOFunction(pReadFile, ...args)

const getPathWithExtension = (path, extension) => format({ ...parse(path), base: undefined, ext: extension })

const safeUnlink = async (path) => {
  try {
    await pUnlink(path)
  } catch (_) {}
}

// Takes a list of absolute paths and returns an array containing all the
// filenames within those directories, if at least one of the directories
// exists. If not, an error is thrown.
const listFunctionsDirectories = async function (srcFolders) {
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

const listFunctionsDirectory = async function (srcFolder) {
  try {
    const filenames = await pReaddir(srcFolder)

    return filenames.map((name) => join(srcFolder, name))
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

const resolveFunctionsDirectories = (input) => {
  const directories = Array.isArray(input) ? input : [input]
  const absoluteDirectories = directories.map((srcFolder) => resolve(srcFolder))

  return absoluteDirectories
}

module.exports = {
  cachedLstat,
  cachedReaddir,
  cachedReadFile,
  lstat: pLstat,
  getPathWithExtension,
  listFunctionsDirectories,
  listFunctionsDirectory,
  resolveFunctionsDirectories,
  safeUnlink,
  writeFile: pWriteFile,
}
