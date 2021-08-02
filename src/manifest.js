const { resolve } = require('path')
const { arch, platform } = require('process')

const { writeFile } = require('./utils/fs')

const MANIFEST_VERSION = 1

const createManifest = async ({ functions, path }) => {
  const formattedFunctions = functions.map(formatFunction)
  const payload = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await writeFile(path, JSON.stringify(payload))
}

const formatFunction = (fn) => ({ ...fn, path: resolve(fn.path) })

module.exports = { createManifest }
