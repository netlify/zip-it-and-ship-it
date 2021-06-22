const { readdir, unlink } = require('fs')
const { format, join, parse } = require('path')
const { promisify } = require('util')

const pReaddir = promisify(readdir)
const pUnlink = promisify(unlink)

const getPathWithExtension = (path, extension) => format({ ...parse(path), base: undefined, ext: extension })

const safeUnlink = async (path) => {
  try {
    await pUnlink(path)
  } catch (_) {}
}

const listFunctionsDirectory = async function (srcFolder) {
  try {
    const filenames = await pReaddir(srcFolder)

    return filenames.map((name) => join(srcFolder, name))
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

module.exports = { getPathWithExtension, listFunctionsDirectory, safeUnlink }
