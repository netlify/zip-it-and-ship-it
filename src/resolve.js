const resolve = require('resolve')

// Like `require.resolve()` but works with a custom base directory.
// We need to use `new Promise()` due to a bug with `utils.promisify()` on
// `resolve`:
//   https://github.com/browserify/resolve/issues/151#issuecomment-368210310
const resolveLocation = function(location, basedir) {
  return new Promise((success, reject) => {
    resolve(location, { basedir, preserveSymlinks: true }, (error, resolvedLocation) => {
      if (error) {
        return reject(error)
      }

      success(resolvedLocation)
    })
  })
}

module.exports = { resolveLocation }
