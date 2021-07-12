const { detect, Runtime } = require('elf-cam')

const { RUNTIME_GO, RUNTIME_RUST } = require('../utils/consts')
const { cachedReadFile } = require('../utils/fs')

// Try to guess the runtime by inspecting the binary file.
const detectBinaryRuntime = async function ({ fsCache, path }) {
  try {
    const buffer = await cachedReadFile(fsCache, path)

    return RUNTIMES[detect(buffer)]
  } catch (error) {}
}

const RUNTIMES = {
  [Runtime.Go]: RUNTIME_GO,
  [Runtime.Rust]: RUNTIME_RUST,
}

module.exports = { detectBinaryRuntime }
