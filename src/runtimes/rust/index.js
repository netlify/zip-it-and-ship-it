const { join, extname, dirname, basename } = require('path')

const { RUNTIME_RUST } = require('../../utils/consts')
const { cachedLstat, cachedReaddir } = require('../../utils/fs')
const { zipBinary } = require('../../zip_binary')
const { detectBinaryRuntime } = require('../detect_runtime')

const { build } = require('./builder')

const detectRustFunction = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return false
  }

  const files = await cachedReaddir(fsCache, path)

  return files.includes('Cargo.toml')
}

const findFunctionsInPaths = async function ({ fsCache, paths }) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime({ fsCache, path })

      if (runtime === RUNTIME_RUST) {
        return processBinary({ fsCache, path })
      }

      const isRustSource = await detectRustFunction({ fsCache, path })

      if (isRustSource) {
        return processSource({ fsCache, path })
      }
    }),
  )

  return functions.filter(Boolean)
}

const processBinary = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)
  const name = basename(path, extname(path))

  return {
    mainFile: path,
    name,
    srcDir: dirname(path),
    srcPath: path,
    stat,
  }
}

const processSource = ({ path }) => {
  const functionName = basename(path)
  const mainFile = join(path, 'src', 'main.rs')

  return {
    mainFile,
    name: functionName,
    srcDir: path,
    srcPath: path,
  }
}

// Rust functions must always be zipped.
// The name of the binary inside the zip file must
// always be `bootstrap` because they include the
// Lambda runtime, and that's the name that AWS
// expects for those kind of functions.
const zipFunction = async function ({ config, mainFile, srcPath, destFolder, stat, filename, runtime }) {
  const destPath = join(destFolder, `${filename}.zip`)
  const isSource = extname(mainFile) === '.rs'

  let zipOptions = {
    srcPath,
    stat,
  }

  await zipBinary({ srcPath, destPath, filename: 'bootstrap', stat, runtime })
  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_RUST, zipFunction }
