const { join } = require('path')

const cpFile = require('cp-file')

const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_ZISI, RUNTIME_JS } = require('../../utils/consts')

const { getBundler } = require('./bundlers')
const { findFunctionsInPaths } = require('./finder')
const { detectEsModule } = require('./utils/detect_es_module')
const { zipNodeJs } = require('./utils/zip')

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
const getDefaultBundler = async ({ extension, mainFile, featureFlags = {} }) => {
  if (['.mjs', '.ts'].includes(extension)) {
    return JS_BUNDLER_ESBUILD
  }

  if (featureFlags.defaultEsModulesToEsbuild) {
    const isEsModule = await detectEsModule({ mainFile })

    if (isEsModule) {
      return JS_BUNDLER_ESBUILD
    }
  }

  return JS_BUNDLER_ZISI
}

// A proxy for the `getSrcFiles` function which adds a default `bundler` using
// the `getDefaultBundler` function.
const getSrcFilesWithBundler = async (parameters) => {
  const bundlerName = parameters.config.nodeBundler || (await getDefaultBundler({ extension: parameters.extension }))
  const bundler = getBundler(bundlerName)

  return bundler.getSrcFiles({ ...parameters })
}

const zipFunction = async function ({
  archiveFormat,
  basePath,
  config = {},
  destFolder,
  extension,
  featureFlags,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot,
  srcDir,
  srcPath,
  stat,
}) {
  const bundlerName = config.nodeBundler || (await getDefaultBundler({ extension, mainFile, featureFlags }))
  const bundler = getBundler(bundlerName)

  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { config, path: destPath }
  }

  const {
    aliases,
    cleanupFunction = () => {},
    basePath: finalBasePath = basePath,
    bundlerWarnings,
    inputs,
    mainFile: finalMainFile = mainFile,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    srcFiles,
  } = await bundler.bundle({
    basePath,
    config,
    extension,
    featureFlags,
    filename,
    mainFile,
    name,
    pluginsModulesPath,
    repositoryRoot,
    srcDir,
    srcPath,
    stat,
  })

  const zipPath = await zipNodeJs({
    aliases,
    archiveFormat,
    basePath: finalBasePath,
    destFolder,
    extension,
    filename,
    mainFile: finalMainFile,
    pluginsModulesPath,
    srcFiles,
  })

  await cleanupFunction()

  return {
    bundler: bundlerName,
    bundlerWarnings,
    config,
    inputs,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path: zipPath,
  }
}

const zipWithFunctionWithFallback = async ({ config = {}, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (config.nodeBundler !== JS_BUNDLER_ESBUILD_ZISI) {
    return zipFunction({ ...parameters, config })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, config: { ...config, nodeBundler: JS_BUNDLER_ESBUILD } })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, config: { ...config, nodeBundler: JS_BUNDLER_ZISI } })

      return { ...data, bundlerErrors: esbuildError.errors }
    } catch (zisiError) {
      throw esbuildError
    }
  }
}

module.exports = {
  findFunctionsInPaths,
  getSrcFiles: getSrcFilesWithBundler,
  name: RUNTIME_JS,
  zipFunction: zipWithFunctionWithFallback,
}
