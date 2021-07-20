const { join, extname, dirname, basename } = require('path')

const { RUNTIME_RUST } = require('../../utils/consts')
const { cachedLstat, cachedReaddir } = require('../../utils/fs')
const { zipBinary } = require('../../zip_binary')
const { detectBinaryRuntime } = require('../detect_runtime')

const { build } = require('./builder')
const { MANIFEST_NAME } = require('./constants')

const detectRustFunction = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return
  }

  const files = await cachedReaddir(fsCache, path)
  const hasCargoManifest = files.includes(MANIFEST_NAME)

  if (!hasCargoManifest) {
    return
  }

  const mainFilePath = join(path, 'src', 'main.rs')

  try {
    const mainFile = await cachedLstat(fsCache, mainFilePath)

    if (mainFile.isFile()) {
      return mainFilePath
    }
  } catch (_) {
    // no-op
  }
}

const findFunctionsInPaths = async function ({ featureFlags, fsCache, paths }) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime({ fsCache, path })

      if (runtime === RUNTIME_RUST) {
        return processBinary({ fsCache, path })
      }

      if (featureFlags.buildRustSource !== true) {
        return
      }

      const rustSourceFile = await detectRustFunction({ fsCache, path })

      if (rustSourceFile) {
        return processSource({ fsCache, mainFile: rustSourceFile, path })
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

const processSource = ({ mainFile, path }) => {
  const functionName = basename(path)

  return {
    mainFile,
    name: functionName,
    srcDir: path,
    srcPath: path,
  }
}

const zipFunction = async function ({ config, destFolder, filename, mainFile, runtime, srcDir, srcPath, stat }) {
  const destPath = join(destFolder, `${filename}.zip`)
  const isSource = extname(mainFile) === '.rs'
  const zipOptions = {
    destPath,
    filename: 'bootstrap',
    runtime,
  }

  if (isSource) {
    const { path: binaryPath, stat: binaryStat } = await build({ srcDir })

    await zipBinary({ ...zipOptions, srcPath: binaryPath, stat: binaryStat })
  } else {
    await zipBinary({ ...zipOptions, srcPath, stat })
  }

  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_RUST, zipFunction }
