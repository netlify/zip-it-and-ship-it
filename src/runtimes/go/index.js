const { basename, dirname, extname, join } = require('path')

const cpFile = require('cp-file')

const { RUNTIME_GO } = require('../../utils/consts')
const { cachedLstat, cachedReaddir } = require('../../utils/fs')
const { detectBinaryRuntime } = require('../detect_runtime')

const { build } = require('./builder')

const detectGoFunction = async ({ fsCache, path }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return
  }

  const directoryName = basename(path)
  const files = await cachedReaddir(fsCache, path)
  const mainFileName = [`${directoryName}.go`, 'main.go'].find((name) => files.includes(name))

  if (mainFileName === undefined) {
    return
  }

  return mainFileName
}

const findFunctionsInPaths = async function ({ featureFlags, fsCache, paths }) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime({ fsCache, path })

      if (runtime === RUNTIME_GO) {
        return processBinary({ fsCache, path })
      }

      if (featureFlags.buildGoSource !== true) {
        return
      }

      const goSourceFile = await detectGoFunction({ fsCache, path })

      if (goSourceFile) {
        return processSource({ fsCache, mainFile: goSourceFile, path })
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
    mainFile: join(path, mainFile),
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
