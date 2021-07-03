const { join, extname, dirname, basename } = require('path')

const cpFile = require('cp-file')

const { RUNTIME_GO } = require('../../utils/consts')
const { cachedLstat, cachedReaddir } = require('../../utils/fs')
const { zipBinary } = require('../../zip_binary')
const { detectBinaryRuntime } = require('../detect_runtime')

const { build: processSource } = require('./builder')

const copyFunction = async function ({ config, destFolder, filename, srcPath }) {
  const destPath = join(destFolder, filename)

  await cpFile(srcPath, destPath)

  return { config, path: destPath }
}

const detectGoFunction = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return false
  }

  const files = await cachedReaddir(fsCache, path)

  return files.includes('main.go')
}

const findFunctionsInPaths = async function ({ fsCache, paths }) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const isGoSource = await detectGoFunction({ fsCache, path })

      if (isGoSource) {
        return processSource({ directory: path })
      }

      const runtime = await detectBinaryRuntime({ fsCache, path })

      if (runtime === RUNTIME_GO) {
        return processBinary({ fsCache, path })
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

const zipFunction = async function ({ config, destFolder, filename, mainFile, name, runtime, srcDir, srcPath, stat }) {
  const isBuiltFromSource = srcDir !== dirname(mainFile)

  // If this is a pre-existing binary (i.e. not built from source by us), we
  // simply copy it to the destination folder, for backward-compatibility.
  if (!isBuiltFromSource) {
    return copyFunction({ config, destFolder, filename, srcPath })
  }

  const destPath = join(destFolder, `${filename}.zip`)

  await zipBinary({ destPath, filename: name, srcPath, runtime, stat })

  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_GO, zipFunction }
