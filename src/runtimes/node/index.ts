import { join } from 'path'

import cpFile from 'cp-file'

import { GetSrcFilesFunction, Runtime, ZipFunction } from '../runtime'

import { getBundler, getDefaultBundler } from './bundlers'
import { findFunctionsInPaths, findFunctionInPath } from './finder'
import { findISCDeclarationsInPath } from './in_source_config'
import { createAliases as createPluginsModulesPathAliases, getPluginsModulesPath } from './utils/plugin_modules_path'
import { zipNodeJs } from './utils/zip'

export { NodeVersionString } from './utils/node_version'

// A proxy for the `getSrcFiles` function which adds a default `bundler` using
// the `getDefaultBundler` function.
const getSrcFilesWithBundler: GetSrcFilesFunction = async (parameters) => {
  const pluginsModulesPath = await getPluginsModulesPath(parameters.srcDir)
  const bundlerName =
    parameters.config.nodeBundler ||
    (await getDefaultBundler({
      extension: parameters.extension,
      featureFlags: parameters.featureFlags,
      mainFile: parameters.mainFile,
    }))
  const bundler = getBundler(bundlerName)

  return bundler.getSrcFiles({ ...parameters, pluginsModulesPath })
}

const zipFunction: ZipFunction = async function ({
  archiveFormat,
  basePath,
  config = {},
  destFolder,
  extension,
  featureFlags,
  filename,
  mainFile,
  name,
  repositoryRoot,
  runtime,
  srcDir,
  srcPath,
  stat,
}) {
  const pluginsModulesPath = await getPluginsModulesPath(srcDir)
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
    aliases = new Map(),
    cleanupFunction,
    basePath: finalBasePath,
    bundlerWarnings,
    inputs,
    mainFile: finalMainFile = mainFile,
    moduleFormat,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    rewrites,
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
    runtime,
    srcDir,
    srcPath,
    stat,
  })

  const inSourceConfig = await findISCDeclarationsInPath(mainFile)

  createPluginsModulesPathAliases(srcFiles, pluginsModulesPath, aliases, finalBasePath)

  const zipPath = await zipNodeJs({
    aliases,
    archiveFormat,
    basePath: finalBasePath,
    destFolder,
    extension,
    filename,
    mainFile: finalMainFile,
    moduleFormat,
    rewrites,
    srcFiles,
  })

  await cleanupFunction?.()

  return {
    bundler: bundlerName,
    bundlerWarnings,
    config,
    inputs,
    inSourceConfig,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path: zipPath,
  }
}

const zipWithFunctionWithFallback: ZipFunction = async ({ config = {}, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (config.nodeBundler !== 'esbuild_zisi') {
    return zipFunction({ ...parameters, config })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, config: { ...config, nodeBundler: 'esbuild' } })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, config: { ...config, nodeBundler: 'zisi' } })

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
  name: 'js',
  zipFunction: zipWithFunctionWithFallback,
}

export default runtime
