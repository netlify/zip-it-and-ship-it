const { join } = require('path')

const cpFile = require('cp-file')

const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_ZISI, RUNTIME_JS } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const zisiBundler = require('./bundlers/zisi')
const { findFunctionsInPaths } = require('./finder')
const { getSrcFiles } = require('./src_files')
const { detectEsModule } = require('./utils/detect_es_module')
const { zipEsbuild } = require('./zip_esbuild')

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
  const bundler = parameters.config.nodeBundler || (await getDefaultBundler({ extension: parameters.extension }))

  return getSrcFiles({ ...parameters, bundler })
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
  srcDir,
  srcPath,
  stat,
}) {
  const bundler = config.nodeBundler || (await getDefaultBundler({ extension, mainFile, featureFlags }))
  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { config, path: destPath }
  }

  if (bundler === JS_BUNDLER_ZISI) {
    const {
      basePath: finalBasePath,
      mainFile: finalMainFile,
      srcFiles,
    } = await zisiBundler.bundle({
      basePath,
      config,
      extension,
      featureFlags,
      mainFile,
      name,
      pluginsModulesPath,
      srcDir,
      srcPath,
      stat,
    })
    const zipPath = await zipNodeJs({
      archiveFormat,
      basePath: finalBasePath,
      destFolder,
      extension,
      filename,
      mainFile: finalMainFile,
      pluginsModulesPath,
      srcFiles,
    })

    return { bundler: JS_BUNDLER_ZISI, config, inputs: srcFiles, path: zipPath }
  }

  const {
    aliases,
    cleanupFunction,
    basePath: finalBasePath,
    bundlerWarnings,
    inputs,
    mainFile: finalMainFile,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    srcFiles,
  } = await zipEsbuild({
    basePath,
    config,
    filename,
    mainFile,
    name,
    pluginsModulesPath,
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
    bundler: JS_BUNDLER_ESBUILD,
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
