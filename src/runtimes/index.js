const { zipGoFunction } = require('./go')
const { zipJsFunction } = require('./node')
const { zipRustFunction } = require('./rust')

module.exports = {
  go: zipGoFunction,
  js: zipJsFunction,
  rs: zipRustFunction,
}
