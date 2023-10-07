import { extname, join } from 'path'

import { copyFile } from 'cp-file'

import { INVOCATION_MODE } from '../../function.js'
import getInternalValue from '../../utils/get_internal_value.js'
import { GetSrcFilesFunction, Runtime, RUNTIME, ZipFunction } from '../runtime.js'

import { getBundler, getBundlerName } from './bundlers/index.js'
import { NODE_BUNDLER } from './bundlers/types.js'
import { findFunctionsInPaths, findFunctionInPath } from './finder.js'
import { findISCDeclarationsInPath } from './in_source_config/index.js'
import { MODULE_FORMAT, MODULE_FILE_EXTENSION } from './utils/module_format.js'
import { getNodeRuntime, getNodeRuntimeForV2 } from './utils/node_runtime.js'
import { createAliases as createPluginsModulesPathAliases, getPluginsModulesPath } from './utils/plugin_modules_path.js'
import { zipNodeJs } from './utils/zip.js'

// A proxy for the `getSrcFiles` that calls `getSrcFiles` on the bundler
const getSrcFilesWithBundler: GetSrcFilesFunction = async (parameters) => {
  const { config, extension, featureFlags, mainFile, runtimeAPIVersion, srcDir } = parameters
  const pluginsModulesPath = await getPluginsModulesPath(srcDir)
  const bundlerName = await getBundlerName({
    config,
    extension,
    featureFlags,
    mainFile,
    runtimeAPIVersion,
  })
  const bundler = getBundler(bundlerName)
  const result = await bundler.getSrcFiles({ ...parameters, pluginsModulesPath })

  return result.srcFiles
}

const zipFunction: ZipFunction = async function ({
  archiveFormat,
  basePath,
  cache,
  config = {},
  destFolder,
  extension,
  featureFlags,
  filename,
  isInternal,
  logger,
  mainFile,
  name,
  repositoryRoot,
  runtime,
  srcDir,
  srcPath,
  stat,
}) {
  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)

    await copyFile(srcPath, destPath)

    return { config, path: destPath, entryFilename: '' }
  }

  const inSourceConfig = await findISCDeclarationsInPath(mainFile, { functionName: name, logger })
  const runtimeAPIVersion = inSourceConfig.runtimeAPIVersion === 2 ? 2 : 1

  const pluginsModulesPath = await getPluginsModulesPath(srcDir)
  const bundlerName = await getBundlerName({
    config,
    extension,
    featureFlags,
    mainFile,
    runtimeAPIVersion,
  })
  const bundler = getBundler(bundlerName)
  const {
    aliases = new Map(),
    cleanupFunction,
    basePath: finalBasePath,
    bundlerWarnings,
    includedFiles,
    inputs,
    mainFile: finalMainFile = mainFile,
    moduleFormat,
    nativeNodeModules,
    rewrites = new Map(),
    srcFiles,
  } = await bundler.bundle({
    basePath,
    cache,
    config,
    extension,
    featureFlags,
    filename,
    logger,
    mainFile,
    name,
    pluginsModulesPath,
    repositoryRoot,
    runtime,
    runtimeAPIVersion,
    srcDir,
    srcPath,
    stat,
  })

  createPluginsModulesPathAliases(srcFiles, pluginsModulesPath, aliases, finalBasePath)

  const zipPath = await zipNodeJs({
    aliases,
    archiveFormat,
    basePath: finalBasePath,
    cache,
    destFolder,
    extension,
    featureFlags,
    filename,
    mainFile: finalMainFile,
    moduleFormat,
    name,
    repositoryRoot,
    rewrites,
    runtimeAPIVersion,
    srcFiles,
  })

  await cleanupFunction?.()

  // Getting the invocation mode from ISC, in case the function is using the
  // `stream` helper.
  let { invocationMode } = inSourceConfig

  // If we're using the V2 API, force the invocation to "stream".
  if (runtimeAPIVersion === 2) {
    invocationMode = INVOCATION_MODE.Stream
  }

  // If this is a background function, set the right `invocationMode` value.
  if (name.endsWith('-background')) {
    invocationMode = INVOCATION_MODE.Background
  }

  const outputModuleFormat =
    extname(finalMainFile) === MODULE_FILE_EXTENSION.MJS ? MODULE_FORMAT.ESM : MODULE_FORMAT.COMMONJS

  return {
    bundler: bundlerName,
    bundlerWarnings,
    config,
    displayName: config?.name,
    entryFilename: zipPath.entryFilename,
    generator: config?.generator || getInternalValue(isInternal),
    inputs,
    includedFiles,
    inSourceConfig,
    invocationMode,
    outputModuleFormat,
    nativeNodeModules,
    path: zipPath.path,
    runtimeVersion:
      runtimeAPIVersion === 2 ? getNodeRuntimeForV2(config.nodeVersion) : getNodeRuntime(config.nodeVersion),
  }
}

const zipWithFunctionWithFallback: ZipFunction = async ({ config = {}, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (config.nodeBundler !== NODE_BUNDLER.ESBUILD_ZISI) {
    return zipFunction({ ...parameters, config })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, config: { ...config, nodeBundler: NODE_BUNDLER.ESBUILD } })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, config: { ...config, nodeBundler: NODE_BUNDLER.ZISI } })

      return { ...data, bundlerErrors: esbuildError.errors }
    } catch {
      throw esbuildError
    }
  }
}

const runtime: Runtime = {
  findFunctionsInPaths,
  findFunctionInPath,
  getSrcFiles: getSrcFilesWithBundler,
  name: RUNTIME.JAVASCRIPT,
  zipFunction: zipWithFunctionWithFallback,
}

export default runtime
