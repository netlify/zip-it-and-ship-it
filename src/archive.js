const { createWriteStream } = require('fs')

const archiver = require('archiver')
const endOfStream = require('end-of-stream')
const promisify = require('util.promisify')

const pEndOfStream = promisify(endOfStream)

// Start zipping files
const startZip = function(destPath) {
  const output = createWriteStream(destPath)
  const archive = archiver('zip', { level: 9 })
  archive.pipe(output)
  return { archive, output }
}

// Add new file to zip
const addZipFile = function(archive, file, name, stat) {
  // Ensure sha256 stability regardless of mtime
  archive.file(file, { name, mode: stat.mode, date: new Date(0), stats: stat })
}

// Add new file content to zip
const addZipContent = function(archive, content, name) {
  archive.append(content, { name, date: new Date(0) })
}

// End zipping files
const endZip = async function(archive, output) {
  archive.finalize()
  await pEndOfStream(output)
}

module.exports = { startZip, addZipFile, addZipContent, endZip }
