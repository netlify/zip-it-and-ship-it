const { join } = require('path')

const { zipBinary } = require('../runtime')

// Rust functions must always be zipped.
// The name of the binary inside the zip file must
// always be `bootstrap` because they include the
// Lambda runtime, and that's the name that AWS
// expects for those kind of functions.
const zipRustFunction = async function ({ srcPath, destFolder, stat, filename, runtime }) {
  const destPath = join(destFolder, `${filename}.zip`)
  await zipBinary({ srcPath, destPath, filename: 'bootstrap', stat, runtime })
  return destPath
}

module.exports = { zipRustFunction }
