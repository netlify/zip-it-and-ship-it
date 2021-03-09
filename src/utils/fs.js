const { readdir } = require('fs')
const { join } = require('path')
const { promisify } = require('util')

const pReaddir = promisify(readdir)

const listFunctionsDirectory = async function (srcFolder) {
  try {
    const filenames = await pReaddir(srcFolder)

    return filenames.map((name) => join(srcFolder, name))
  } catch (error) {
    throw new Error(`Functions folder does not exist: ${srcFolder}`)
  }
}

module.exports = { listFunctionsDirectory }
