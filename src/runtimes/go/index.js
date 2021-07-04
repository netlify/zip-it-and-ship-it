const { join, extname, dirname, basename } = require('path')

const cpFile = require('cp-file')

const { RUNTIME_GO } = require('../../utils/consts')
const { cachedLstat, cachedReaddir } = require('../../utils/fs')
const { detectBinaryRuntime } = require('../detect_runtime')

const { build } = require('./builder')

const MAIN_FILE_NAME = 'main.go'

const detectGoFunction = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return false
  }

  const files = await cachedReaddir(fsCache, path)

  return files.includes(MAIN_FILE_NAME)
}

const findFunctionsInPaths = async function ({ fsCache, paths }) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime({ fsCache, path })

      if (runtime === RUNTIME_GO) {
        return processBinary({ fsCache, path })
      }

      const isGoSource = await detectGoFunction({ fsCache, path })

      if (isGoSource) {
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
  const mainFile = join(path, MAIN_FILE_NAME)

  return {
    mainFile,
    name: functionName,
    srcDir: path,
    srcPath: path,
  }
}

const zipFunction = async function ({ config, destFolder, filename, mainFile, srcDir, srcPath }) {
  const destPath = join(destFolder, filename)
  const isSource = extname(mainFile) === '.go'

  // If we're building a Go function from source, we call the build method and
  // it'll take care of placing the binary in the right location. If not, we
  // need to copy the existing binary file to the destination directory.
  await (isSource ? build({ destPath, mainFile, srcDir }) : cpFile(srcPath, destPath))

  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_GO, zipFunction }
