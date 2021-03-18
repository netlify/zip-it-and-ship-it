const { resolve } = require('path')

const makeDir = require('make-dir')
const pMap = require('p-map')

const { getPluginsModulesPath } = require('./node_dependencies')
const { getFunctionsFromPaths } = require('./runtimes')
const { listFunctionsDirectory } = require('./utils/fs')
const { removeFalsy } = require('./utils/remove_falsy')

const DEFAULT_PARALLEL_LIMIT = 5

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (result) => {
  const { bundler, bundlerErrors, bundlerWarnings, config = {}, path, runtime } = result

  return removeFalsy({ bundler, bundlerErrors, bundlerWarnings, config, path, runtime: runtime.name })
}

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
const zipFunctions = async function (
  relativeSrcFolder,
  destFolder,
  { config = {}, externalNodeModules = [], ignoredNodeModules = [], parallelLimit = DEFAULT_PARALLEL_LIMIT } = {},
) {
  const srcFolder = resolve(relativeSrcFolder)
  const [paths] = await Promise.all([listFunctionsDirectory(srcFolder), makeDir(destFolder)])
  const [functions, pluginsModulesPath] = await Promise.all([
    getFunctionsFromPaths(paths, { config, dedupe: true }),
    getPluginsModulesPath(srcFolder),
  ])
  const zipped = await pMap(
    functions.values(),
    async (func) => {
      const zipResult = await func.runtime.zipFunction({
        config: func.config,
        destFolder,
        extension: func.extension,
        externalNodeModules,
        filename: func.filename,
        ignoredNodeModules,
        mainFile: func.mainFile,
        pluginsModulesPath,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
      })

      return { ...zipResult, runtime: func.runtime }
    },
    {
      concurrency: parallelLimit,
    },
  )
  return zipped.filter(Boolean).map(formatZipResult)
}

const zipFunction = async function (relativeSrcPath, destFolder, { pluginsModulesPath: defaultModulesPath } = {}) {
  const srcPath = resolve(relativeSrcPath)
  const functions = await getFunctionsFromPaths([srcPath], { dedupe: true })

  if (functions.size === 0) {
    return
  }

  const { config, extension, filename, mainFile, runtime, srcDir, stat } = functions.values().next().value
  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath

  await makeDir(destFolder)

  const zipResult = await runtime.zipFunction({
    config,
    srcPath,
    destFolder,
    mainFile,
    filename,
    extension,
    srcDir,
    stat,
    runtime,
    pluginsModulesPath,
  })

  return formatZipResult({ ...zipResult, runtime })
}

module.exports = { zipFunction, zipFunctions }
