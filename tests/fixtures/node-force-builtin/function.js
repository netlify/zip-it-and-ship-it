const stream = require('node:stream/web')

module.exports = () => {
  return Boolean(stream.ReadableStream)
}
