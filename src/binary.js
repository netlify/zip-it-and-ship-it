const { readFile } = require('fs')
const { promisify } = require('util')

const { detect, Runtime } = require('elf-cam')

const { startZip, addZipFile, addZipContent, endZip } = require('./archive')

const pReadFile = promisify(readFile)

// Try to guess the runtime by inspecting the binary file.
const binaryRuntime = async function(path) {
  try {
    const buffer = await pReadFile(path)
    return RUNTIMES[detect(buffer)]
  } catch (error) {
    return undefined
  }
}

const RUNTIMES = {
  [Runtime.Go]: 'go',
  [Runtime.Rust]: 'rs'
}

// Zip a binary function file
const zipBinary = async function(srcPath, destPath, filename, stat, runtime) {
  const { archive, output } = startZip(destPath)
  addZipFile(archive, srcPath, filename, stat)
  addZipContent(archive, JSON.stringify({ runtime }), 'netlify-toolchain')
  await endZip(archive, output)
}

module.exports = { binaryRuntime, zipBinary }
