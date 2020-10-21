const { readFile } = require('fs')

const { detect, Runtime } = require('elf-cam')
const promisify = require('util.promisify')

const { startZip, addZipFile, endZip } = require('./archive')

const pReadFile = promisify(readFile)

// Try to guess the runtime by inspecting the binary file.
const binaryRuntime = async function(path) {
  try {
    const buffer = await pReadFile(path)

    switch (detect(buffer)) {
      case Runtime.Go:
        return 'go'
      case Runtime.Rust:
        return 'rs'
      default:
        return undefined
    }
  } catch (error) {
    return undefined
  }
}

// Zip a binary function file
const zipBinary = async function(srcPath, destPath, filename, stat) {
  const { archive, output } = startZip(destPath)
  addZipFile(archive, srcPath, filename, stat)
  await endZip(archive, output)
}

module.exports = { binaryRuntime, zipBinary }
