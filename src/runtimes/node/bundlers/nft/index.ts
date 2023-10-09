import { basename, dirname, join, normalize, resolve } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import resolveDependency from '@vercel/nft/out/resolve-dependency.js'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import type { RuntimeCache } from '../../../../utils/cache.js'
import { cachedReadFile, getPathWithExtension } from '../../../../utils/fs.js'
import { minimatch } from '../../../../utils/matching.js'
import { getBasePath } from '../../utils/base_path.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import { MODULE_FILE_EXTENSION } from '../../utils/module_format.js'
import { getNodeSupportMatrix } from '../../utils/node_version.js'
import type { GetSrcFilesFunction, BundleFunction } from '../types.js'

import { processESM } from './es_modules.js'
import { transform, getTransformer } from './transformer.js'

const appearsToBeModuleName = (name: string) => !name.startsWith('.')

const bundle: BundleFunction = async ({
  basePath,
  cache,
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot = basePath,
  runtimeAPIVersion,
}) => {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath || basePath,
  )
  const {
    aliases,
    bundledPaths = [],
    mainFile: normalizedMainFile,
    moduleFormat,
    rewrites,
    tracedPaths,
  } = await traceFilesAndTranspile({
    basePath: repositoryRoot,
    cache,
    config,
    featureFlags,
    mainFile,
    pluginsModulesPath,
    name,
    repositoryRoot,
    runtimeAPIVersion,
  })
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)
  const filteredIncludedPaths = [...filterExcludedPaths(tracedPaths, excludePatterns), ...includedPaths]
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  // Sorting the array to make the checksum deterministic.
  const srcFiles = [...filteredIncludedPaths].sort()

  // The inputs are the union of any traced paths (included as files in the end
  // result) and any bundled paths (merged together in the bundle).
  const inputs = bundledPaths.length === 0 ? tracedPaths : [...new Set([...tracedPaths, ...bundledPaths])]

  return {
    aliases,
    basePath: getBasePath(dirnames),
    includedFiles: includedPaths,
    inputs,
    mainFile: normalizedMainFile,
    moduleFormat,
    rewrites,
    srcFiles,
  }
}

const getIgnoreFunction = (config: FunctionConfig) => {
  const nodeSupport = getNodeSupportMatrix(config.nodeVersion)

  // Paths that will be excluded from the tracing process.
  const ignore = nodeSupport.awsSDKV3 ? ['node_modules/@aws-sdk/**'] : ['node_modules/aws-sdk/**']

  return (path: string) => {
    const shouldIgnore = ignore.some((expression) => minimatch(path, expression))

    return shouldIgnore
  }
}

const traceFilesAndTranspile = async function ({
  basePath,
  cache,
  config,
  featureFlags,
  mainFile,
  pluginsModulesPath,
  name,
  repositoryRoot,
  runtimeAPIVersion,
}: {
  basePath?: string
  cache: RuntimeCache
  config: FunctionConfig
  featureFlags: FeatureFlags
  mainFile: string
  pluginsModulesPath?: string
  name: string
  repositoryRoot?: string
  runtimeAPIVersion: number
}) {
  const transformer = await getTransformer(runtimeAPIVersion, mainFile, repositoryRoot)
  const {
    fileList: dependencyPaths,
    esmFileList,
    reasons,
  } = await nodeFileTrace([mainFile], {
    // Default is 1024. Allowing double the fileIO in parallel makes nft faster, but uses a little more memory.
    fileIOConcurrency: 2048,
    base: basePath,
    cache: cache.nftCache,
    ignore: getIgnoreFunction(config),
    readFile: async (path: string) => {
      try {
        const isMainFile = path === mainFile

        // If there is a transformer set and this is the main file, transform.
        // We do this when we want to bundle local imports (so that importing
        // between ESM and CJS works) and when we want to transpile TypeScript.
        if (transformer && isMainFile) {
          const { bundledPaths, transpiled } = await transform({
            config,
            name,
            format: transformer?.format,
            path,
          })

          // If this is the main file, the final path of the compiled file may
          // have been set by the transformer. It's fine to do this, since the
          // only place where this file will be imported from is our entry file
          // and we'll know the right path to use.
          const newPath = transformer?.newMainFile ?? getPathWithExtension(path, MODULE_FILE_EXTENSION.JS)

          // Overriding the contents of the `.ts` file.
          transformer?.rewrites.set(path, transpiled)

          // Rewriting the `.ts` path to `.js` in the bundle.
          transformer?.aliases.set(path, newPath)

          // Registering the input files that were bundled into the transpiled
          // file.
          transformer?.bundledPaths?.push(...bundledPaths)

          return transpiled
        }

        return await cachedReadFile(cache.fileCache, path)
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
          return null
        }

        throw error
      }
    },
    resolve: async (specifier, parent, ...args) => {
      try {
        return await resolveDependency.default(specifier, parent, ...args)
      } catch (error) {
        // If we get a `MODULE_NOT_FOUND` error for what appears to be a module
        // name, we try to resolve it a second time using `pluginsModulesPath`
        // as the base directory.
        if (error.code === 'MODULE_NOT_FOUND' && pluginsModulesPath && appearsToBeModuleName(specifier)) {
          const newParent = join(pluginsModulesPath, basename(parent))

          return await resolveDependency.default(specifier, newParent, ...args)
        }

        throw error
      }
    },
  })
  const normalizedTracedPaths = [...dependencyPaths].map((path) => (basePath ? resolve(basePath, path) : resolve(path)))

  if (transformer) {
    return {
      aliases: transformer.aliases,
      bundledPaths: transformer.bundledPaths,
      mainFile: transformer.newMainFile ?? getPathWithExtension(mainFile, MODULE_FILE_EXTENSION.JS),
      moduleFormat: transformer.format,
      rewrites: transformer.rewrites,
      tracedPaths: normalizedTracedPaths,
    }
  }

  const { moduleFormat, rewrites } = await processESM({
    basePath,
    cache,
    config,
    esmPaths: esmFileList,
    featureFlags,
    mainFile,
    reasons,
    name,
    runtimeAPIVersion,
  })

  return {
    mainFile,
    moduleFormat,
    rewrites,
    tracedPaths: normalizedTracedPaths,
  }
}

const getSrcFiles: GetSrcFilesFunction = async function ({ basePath, config, mainFile }) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], {
    base: basePath,
    ignore: getIgnoreFunction(config),
  })
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )
  const srcFiles = filterExcludedPaths(normalizedDependencyPaths, excludePatterns)
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)

  return {
    srcFiles: [...srcFiles, ...includedPaths],
    includedFiles: includedPaths,
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
