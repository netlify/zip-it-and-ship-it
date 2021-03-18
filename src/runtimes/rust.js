const { lstat } = require('fs')
const { join, extname, dirname, basename } = require('path')
const { promisify } = require('util')

const pLstat = promisify(lstat)

const { RUNTIME_RUST } = require('../utils/consts')
const { zipBinary } = require('../zip_binary')

const { detectBinaryRuntime } = require('./detect_runtime')

const findFunctionsInPaths = async function (paths) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime(path)

      if (runtime !== RUNTIME_RUST) return

      const stat = await pLstat(path)
      const name = basename(path, extname(path))

      return {
        mainFile: path,
        name,
        srcDir: dirname(path),
        srcPath: path,
        stat,
      }
    }),
  )

  return functions.filter(Boolean)
}

// Rust functions must always be zipped.
// The name of the binary inside the zip file must
// always be `bootstrap` because they include the
// Lambda runtime, and that's the name that AWS
// expects for those kind of functions.
const zipFunction = async function ({ config, srcPath, destFolder, stat, filename, runtime }) {
  const destPath = join(destFolder, `${filename}.zip`)
  await zipBinary({ srcPath, destPath, filename: 'bootstrap', stat, runtime })
  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_RUST, zipFunction }
