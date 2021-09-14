const { resolve } = require('path')

const makeDir = require('make-dir')
const pMap = require('p-map')

const { getFlags } = require('./feature_flags')
const { createManifest } = require('./manifest')
const { getPluginsModulesPath } = require('./node_dependencies')
const { getFunctionsFromPaths } = require('./runtimes')
const { ARCHIVE_FORMAT_NONE, ARCHIVE_FORMAT_ZIP } = require('./utils/consts')
const { listFunctionsDirectories, resolveFunctionsDirectories } = require('./utils/fs')
const { removeFalsy } = require('./utils/remove_falsy')

const DEFAULT_PARALLEL_LIMIT = 5

const validateArchiveFormat = (archiveFormat) => {
  if (![ARCHIVE_FORMAT_NONE, ARCHIVE_FORMAT_ZIP].includes(archiveFormat)) {
    throw new Error(`Invalid archive format: ${archiveFormat}`)
  }
}

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (result) => {
  const {
    bundler,
    bundlerErrors,
    bundlerWarnings,
    config = {},
    inputs,
    mainFile,
    name,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path,
    runtime,
  } = result

  return removeFalsy({
    bundler,
    bundlerErrors,
    bundlerWarnings,
    config,
    inputs,
    mainFile,
    name,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path,
    runtime: runtime.name,
  })
}

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
const zipFunctions = async function (
  relativeSrcFolders,
  destFolder,
  {
    archiveFormat = ARCHIVE_FORMAT_ZIP,
    basePath,
    config = {},
    featureFlags: inputFeatureFlags,
    manifest,
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
  } = {},
) {
  validateArchiveFormat(archiveFormat)

  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const [paths] = await Promise.all([listFunctionsDirectories(srcFolders), makeDir(destFolder)])
  const [functions, pluginsModulesPath] = await Promise.all([
    getFunctionsFromPaths(paths, { config, dedupe: true, featureFlags }),

    // All function directories should be part of the same project root, so we
    // can get away with computing the plugins modules path from any of the
    // source directories.
    getPluginsModulesPath(srcFolders[0]),
  ])
  const results = await pMap(
    functions.values(),
    async (func) => {
      const zipResult = await func.runtime.zipFunction({
        archiveFormat,
        basePath,
        config: func.config,
        destFolder,
        extension: func.extension,
        filename: func.filename,
        mainFile: func.mainFile,
        name: func.name,
        pluginsModulesPath,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
        featureFlags,
      })

      return { ...zipResult, mainFile: func.mainFile, name: func.name, runtime: func.runtime }
    },
    {
      concurrency: parallelLimit,
    },
  )
  const formattedResults = results.filter(Boolean).map(formatZipResult)

  if (manifest !== undefined) {
    await createManifest({ functions: formattedResults, path: resolve(manifest) })
  }

  return formattedResults
}

const zipFunction = async function (
  relativeSrcPath,
  destFolder,
  {
    archiveFormat = ARCHIVE_FORMAT_ZIP,
    basePath,
    config: inputConfig = {},
    featureFlags: inputFeatureFlags,
    pluginsModulesPath: defaultModulesPath,
  } = {},
) {
  validateArchiveFormat(archiveFormat)

  const featureFlags = getFlags(inputFeatureFlags)
  const srcPath = resolve(relativeSrcPath)
  const functions = await getFunctionsFromPaths([srcPath], { config: inputConfig, dedupe: true, featureFlags })

  if (functions.size === 0) {
    return
  }

  const { config, extension, filename, mainFile, name, runtime, srcDir, stat } = functions.values().next().value
  const pluginsModulesPath =
    defaultModulesPath === undefined ? await getPluginsModulesPath(srcPath) : defaultModulesPath

  await makeDir(destFolder)

  const zipResult = await runtime.zipFunction({
    archiveFormat,
    basePath,
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
    featureFlags,
  })

  return formatZipResult({ ...zipResult, mainFile, name, runtime })
}

module.exports = { zipFunction, zipFunctions }
