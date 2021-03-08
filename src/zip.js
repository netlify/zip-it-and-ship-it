const makeDir = require('make-dir')
const pMap = require('p-map')

const { getPluginsModulesPath } = require('./node_dependencies')
const runtimes = require('./runtimes')
const { listFunctionsDirectory } = require('./utils/fs')
const { removeFalsy } = require('./utils/remove_falsy')

const DEFAULT_PARALLEL_LIMIT = 5

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
    skipGo,
    zipGo,
  } = {},
) {
  await makeDir(destFolder)

  const paths = await listFunctionsDirectory(srcFolder)
  const functions = await runtimes.getFunctionsFromPaths(paths, { dedupe: true })
  const pluginsModulesPath = await getPluginsModulesPath(srcFolder)
  const zipped = await pMap(
    functions.values(),
    (func) =>
      zipFunction(func.srcPath, destFolder, {
        extension: func.extension,
        filename: func.filename,
        jsBundler,
        jsExternalModules,
        jsIgnoredModules,
        mainFile: func.mainFile,
        pluginsModulesPath,
        runtime: func.runtime,
        srcDir: func.srcDir,
        stat: func.stat,
        skipGo,
        zipGo,
      }),
    {
      concurrency: parallelLimit,
    },
  )
  return zipped.filter(Boolean)
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

  const { bundler, bundlerErrors, bundlerWarnings, path } = await runtime.zipFunction({
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

  return removeFalsy({ bundler, bundlerErrors, bundlerWarnings, path, runtime: runtime.name })
}

module.exports = { zipFunction, zipFunctions }
