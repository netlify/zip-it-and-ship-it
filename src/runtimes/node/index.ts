import { join } from 'path'

import cpFile from 'cp-file'

import { FeatureFlags } from '../../feature_flags'
import { RUNTIME_JS } from '../../utils/consts'
import { GetSrcFilesFunction, ZipFunction } from '../runtime'

import { getBundler } from './bundlers'
import { findFunctionsInPaths } from './finder'
import { detectEsModule } from './utils/detect_es_module'
import { zipNodeJs } from './utils/zip'

export type NodeBundler = 'esbuild' | 'esbuild_zisi' | 'nft' | 'zisi'

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
const getDefaultBundler = async ({
  extension,
  mainFile,
  featureFlags,
}: {
  extension: string
  mainFile: string
  featureFlags: FeatureFlags
}): Promise<NodeBundler> => {
  if (['.mjs', '.ts'].includes(extension)) {
    return 'esbuild'
  }

  if (featureFlags.defaultEsModulesToEsbuild) {
    const isEsModule = await detectEsModule({ mainFile })

    if (isEsModule) {
      return 'esbuild'
    }
  }

  return 'zisi'
}

// A proxy for the `getSrcFiles` function which adds a default `bundler` using
// the `getDefaultBundler` function.
const getSrcFilesWithBundler: GetSrcFilesFunction = async (parameters) => {
  const bundlerName =
    parameters.config.nodeBundler ||
    (await getDefaultBundler({
      extension: parameters.extension,
      featureFlags: parameters.featureFlags,
      mainFile: parameters.mainFile,
    }))
  const bundler = getBundler(bundlerName)

  return bundler.getSrcFiles({ ...parameters })
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
  pluginsModulesPath,
  repositoryRoot,
  runtime,
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
    cleanupFunction,
    basePath: finalBasePath,
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
    runtime,
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

  await cleanupFunction?.()

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
    } catch (zisiError) {
      throw esbuildError
    }
  }
}

const runtime = {
  findFunctionsInPaths,
  getSrcFiles: getSrcFilesWithBundler,
  name: RUNTIME_JS,
  zipFunction: zipWithFunctionWithFallback,
}

export default runtime
