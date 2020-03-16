const { readFile } = require('fs')

const { parse: parseElf } = require('elf-tools')
const promisify = require('util.promisify')

const { startZip, addZipFile, endZip } = require('./archive')

const pReadFile = promisify(readFile)

// Check if a file is a Go executable
const isGoExe = async function(path) {
  try {
    const buffer = await pReadFile(path)
    const { sections } = parseElf(buffer)
    return sections.some(isGoHeader)
  } catch (error) {
    return false
  }
}

const isGoHeader = function({ header: { name } }) {
  return name === '.note.go.buildid'
}

// Zip a Go function file
const zipGoExe = async function(srcPath, destPath, filename, stat) {
  const { archive, output } = startZip(destPath)
  addZipFile(archive, srcPath, filename, stat)
  await endZip(archive, output)
}

module.exports = { isGoExe, zipGoExe }
