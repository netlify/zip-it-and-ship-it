const { arch, platform } = require('process')

const { safeWriteFile } = require('./utils/fs')

const MANIFEST_VERSION = 1

const createManifest = async ({ functions, path }) => {
  const payload = {
    functions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await safeWriteFile(path, JSON.stringify(payload))
}

module.exports = { createManifest }
