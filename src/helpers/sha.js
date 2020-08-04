const { createHash } = require('crypto')
const { createReadStream } = require('fs')

const getStream = require('get-stream')

// Retrieve the SHA1 checksum of a file.
// Does it in streaming mode, for best performance.
const computeSha1 = async function(filePath) {
  const fileStream = createReadStream(filePath)
  const hashStream = createHash('sha1')
  hashStream.setEncoding('hex')
  const sha1Checksum = await getStream(fileStream.pipe(hashStream))
  return sha1Checksum
}

module.exports = { computeSha1 }
