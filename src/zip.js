const makeDir = require('make-dir')
const pMap = require('p-map')

const { getPluginsModulesPath } = require('./node_dependencies')
const runtimes = require('./runtimes')
const { listFunctionsDirectory } = require('./utils/fs')
const { removeFalsy } = require('./utils/remove_falsy')

const DEFAULT_PARALLEL_LIMIT = 5

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (result) => {
  const { bundler, bundlerErrors, bundlerWarnings, path, runtime } = result

  return removeFalsy({ bundler, bundlerErrors, bundlerWarnings, path, runtime: runtime.name })
}

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
// TODO: remove `skipGo` option in next major release
const zipFunctions = async function (
  srcFolder,
  destFolder,
  {
    jsBundler,
    jsExternalModules = [],
    jsIgnoredModules = [],
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
    skipGo = true,
    zipGo,
  } = {},
) {
  await makeDir(destFolder)

  const paths = await listFunctionsDirectory(srcFolder)
  const functions = await runtimes.getFunctionsFromPaths(paths, { dedupe: true })
  const pluginsModulesPath = await getPluginsModulesPath(srcFolder)
  const zipped = await pMap(
    functions.values(),
    async (func) => {
      const zipResult = await func.runtime.zipFunction({
        destFolder,
        extension: func.extension,
        filename: func.filename,
        jsBundler,
        jsExternalModules,
        jsIgnoredModules,
        mainFile: func.mainFile,
        pluginsModulesPath,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
        zipGo: zipGo === undefined ? !skipGo : zipGo,
      })

      return { ...zipResult, runtime: func.runtime }
    },
    {
      concurrency: parallelLimit,
    },
  )
  return zipped.filter(Boolean).map(formatZipResult)
}

const zipFunction = async function (
  srcPath,
  destFolder,
  {
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
    pluginsModulesPath: defaultModulesPath,
    skipGo = true,
    zipGo = !skipGo,
  } = {},
) {
  const functions = await runtimes.getFunctionsFromPaths([srcPath], { dedupe: true })

  if (functions.size === 0) {
    return
  }

  const { extension, filename, mainFile, runtime, srcDir, stat } = functions.values().next().value
  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath

  await makeDir(destFolder)

  const zipResult = await runtime.zipFunction({
    jsBundler,
    jsExternalModules,
    jsIgnoredModules,
    srcPath,
    destFolder,
    mainFile,
    filename,
    extension,
    srcDir,
    stat,
    zipGo,
    runtime,
    pluginsModulesPath,
  })

  return formatZipResult({ ...zipResult, runtime })
}

module.exports = { zipFunction, zipFunctions }
