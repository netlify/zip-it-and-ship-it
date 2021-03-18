const { lstat } = require('fs')
const { join, extname, dirname, basename } = require('path')
const { promisify } = require('util')

const pLstat = promisify(lstat)

const cpFile = require('cp-file')

const { RUNTIME_GO } = require('../utils/consts')

const { detectBinaryRuntime } = require('./detect_runtime')

const findFunctionsInPaths = async function (paths) {
  const functions = await Promise.all(
    paths.map(async (path) => {
      const runtime = await detectBinaryRuntime(path)

      if (runtime !== RUNTIME_GO) return

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

const zipFunction = async function ({ config, srcPath, destFolder, filename }) {
  const destPath = join(destFolder, filename)
  await cpFile(srcPath, destPath)
  return { config, path: destPath }
}

module.exports = { findFunctionsInPaths, name: RUNTIME_GO, zipFunction }
