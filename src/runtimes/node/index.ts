import { join } from 'path'

import { copyFile } from 'cp-file'

import { GetSrcFilesFunction, Runtime, RuntimeType, ZipFunction } from '../runtime.js'

import { getBundler, getBundlerName } from './bundlers/index.js'
import { NodeBundlerType } from './bundlers/types.js'
import { findFunctionsInPaths, findFunctionInPath } from './finder.js'
import { findISCDeclarationsInPath } from './in_source_config/index.js'
import { createAliases as createPluginsModulesPathAliases, getPluginsModulesPath } from './utils/plugin_modules_path.js'
import { zipNodeJs } from './utils/zip.js'

export { NodeVersionString } from './utils/node_version.js'

// A proxy for the `getSrcFiles` that calls `getSrcFiles` on the bundler
const getSrcFilesWithBundler: GetSrcFilesFunction = async (parameters) => {
  const { config, extension, featureFlags, mainFile, srcDir } = parameters
  const pluginsModulesPath = await getPluginsModulesPath(srcDir)
  const bundlerName = await getBundlerName({
    config,
    extension,
    featureFlags,
    mainFile,
  })
  const bundler = getBundler(bundlerName)
  const result = await bundler.getSrcFiles({ ...parameters, pluginsModulesPath })

  return result.srcFiles
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
  const bundlerName = await getBundlerName({
    config,
    extension,
    featureFlags,
    mainFile,
  })
  const bundler = getBundler(bundlerName)

  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)

    await copyFile(srcPath, destPath)

    return { config, path: destPath }
  }

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

  const inSourceConfig = await findISCDeclarationsInPath(mainFile, name)

  createPluginsModulesPathAliases(srcFiles, pluginsModulesPath, aliases, finalBasePath)

  const zipPath = await zipNodeJs({
    aliases,
    archiveFormat,
    basePath: finalBasePath,
    destFolder,
    extension,
    featureFlags,
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
    includedFiles,
    inSourceConfig,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path: zipPath,
  }
}

const zipWithFunctionWithFallback: ZipFunction = async ({ config = {}, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (config.nodeBundler !== NodeBundlerType.ESBUILD_ZISI) {
    return zipFunction({ ...parameters, config })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, config: { ...config, nodeBundler: NodeBundlerType.ESBUILD } })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, config: { ...config, nodeBundler: NodeBundlerType.ZISI } })

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
  name: RuntimeType.JAVASCRIPT,
  zipFunction: zipWithFunctionWithFallback,
}

export default runtime
