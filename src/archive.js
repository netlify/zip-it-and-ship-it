const { createWriteStream } = require('fs')
const { promisify } = require('util')

const archiver = require('archiver')
const endOfStream = require('end-of-stream')

const pEndOfStream = promisify(endOfStream)

// Start zipping files
const startZip = function (destPath) {
  const output = createWriteStream(destPath)
  const archive = archiver('zip', { level: ZIP_LEVEL })
  archive.pipe(output)
  return { archive, output }
}

const ZIP_LEVEL = 9

// Add new file to zip
const addZipFile = function (archive, file, name, stat) {
  // Ensure sha256 stability regardless of mtime
  archive.file(file, { name, mode: stat.mode, date: new Date(0), stats: stat })
}

// Add new file content to zip
const addZipContent = function (archive, content, name) {
  archive.append(content, { name, date: new Date(0) })
}

// End zipping files
const endZip = async function (archive, output) {
  archive.finalize()
  await pEndOfStream(output)
}

module.exports = { startZip, addZipFile, addZipContent, endZip }
