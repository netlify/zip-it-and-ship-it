const { readFile } = require('fs')
const { promisify } = require('util')

const { detect, Runtime } = require('elf-cam')

const { RUNTIME_GO, RUNTIME_RUST } = require('../utils/consts')

const pReadFile = promisify(readFile)

// Try to guess the runtime by inspecting the binary file.
const detectBinaryRuntime = async function (path) {
  try {
    const buffer = await pReadFile(path)

    return RUNTIMES[detect(buffer)]
  } catch (error) {}
}

const RUNTIMES = {
  [Runtime.Go]: RUNTIME_GO,
  [Runtime.Rust]: RUNTIME_RUST,
}

module.exports = { detectBinaryRuntime }
