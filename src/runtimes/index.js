const goRuntime = require('./go')
const jsRuntime = require('./node')
const rustRuntime = require('./rust')

module.exports = {
  go: goRuntime,
  js: jsRuntime,
  rs: rustRuntime,
}
