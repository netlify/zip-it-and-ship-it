const { readdir, unlink } = require('fs')
const { format, join, parse, resolve } = require('path')
const { promisify } = require('util')

const pReaddir = promisify(readdir)
const pUnlink = promisify(unlink)

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
  getPathWithExtension,
  listFunctionsDirectories,
  listFunctionsDirectory,
  resolveFunctionsDirectories,
  safeUnlink,
}
