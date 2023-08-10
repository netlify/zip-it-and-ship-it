import { basename, dirname, join, normalize, resolve, extname } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import resolveDependency from '@vercel/nft/out/resolve-dependency.js'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import type { RuntimeCache } from '../../../../utils/cache.js'
import { cachedReadFile, getPathWithExtension } from '../../../../utils/fs.js'
import { minimatch } from '../../../../utils/matching.js'
import { getBasePath } from '../../utils/base_path.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import { MODULE_FORMAT, MODULE_FILE_EXTENSION, tsExtensions } from '../../utils/module_format.js'
import { getNodeSupportMatrix } from '../../utils/node_version.js'
import { getModuleFormat as getTSModuleFormat } from '../../utils/tsconfig.js'
import type { GetSrcFilesFunction, BundleFunction } from '../types.js'

import { processESM } from './es_modules.js'
import { transpile } from './transpile.js'

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
    mainFile: normalizedMainFile,
    moduleFormat,
    paths: dependencyPaths,
    rewrites,
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
  const filteredIncludedPaths = [...filterExcludedPaths(dependencyPaths, excludePatterns), ...includedPaths]
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  // Sorting the array to make the checksum deterministic.
  const srcFiles = [...filteredIncludedPaths].sort()

  return {
    aliases,
    basePath: getBasePath(dirnames),
    includedFiles: includedPaths,
    inputs: dependencyPaths,
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
  const isTypeScript = tsExtensions.has(extname(mainFile))
  const tsFormat = isTypeScript ? getTSModuleFormat(mainFile, repositoryRoot) : MODULE_FORMAT.COMMONJS
  const tsAliases = new Map<string, string>()
  const tsRewrites = new Map<string, string>()

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
        const extension = extname(path)

        if (tsExtensions.has(extension)) {
          const transpiledSource = await transpile({ config, name, format: tsFormat, path })
          const newPath = getPathWithExtension(path, MODULE_FILE_EXTENSION.JS)

          // Overriding the contents of the `.ts` file.
          tsRewrites.set(path, transpiledSource)

          // Rewriting the `.ts` path to `.js` in the bundle.
          tsAliases.set(path, newPath)

          return transpiledSource
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
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )

  if (isTypeScript) {
    return {
      aliases: tsAliases,
      mainFile: getPathWithExtension(mainFile, MODULE_FILE_EXTENSION.JS),
      moduleFormat: tsFormat,
      paths: normalizedDependencyPaths,
      rewrites: tsRewrites,
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
    paths: normalizedDependencyPaths,
    rewrites,
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
