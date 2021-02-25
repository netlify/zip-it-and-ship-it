const { join } = require('path')

const cpFile = require('cp-file')
const makeDir = require('make-dir')
const pMap = require('p-map')

const { getSrcPaths, getFunctionInfo } = require('./info')
const { getPluginsModulesPath } = require('./node_dependencies')
const runtimes = require('./runtimes')
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
  const [srcPaths, pluginsModulesPath] = await Promise.all([getSrcPaths(srcFolder), getPluginsModulesPath(srcFolder)])

  const zipped = await pMap(
    srcPaths,
    (srcPath) =>
      zipFunction(srcPath, destFolder, {
        jsBundler,
        jsExternalModules,
        jsIgnoredModules,
        pluginsModulesPath,
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
  const { runtime, filename, extension, srcDir, stat, mainFile } = await getFunctionInfo(srcPath)

  if (runtime === undefined) {
    return
  }

  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath

  await makeDir(destFolder)

  // If the file is a zip, we assume the function is bundled and ready to go.
  // We assume its runtime to be JavaScript and simply copy it to the
  // destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { path: destPath, runtime: 'js' }
  }

  const { bundler, bundlerErrors, bundlerWarnings, path } = await runtimes[runtime].zipFunction({
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
  return removeFalsy({ bundler, bundlerErrors, bundlerWarnings, path, runtime })
}

module.exports = { zipFunction, zipFunctions }
