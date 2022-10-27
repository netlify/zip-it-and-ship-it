import { basename, dirname, join, normalize, resolve } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import nftResolveDependency from '@vercel/nft/out/resolve-dependency.js'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import { cachedReadFile, FsCache } from '../../../../utils/fs.js'
import { minimatch } from '../../../../utils/matching.js'
import { getBasePath } from '../../utils/base_path.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import type { GetSrcFilesFunction, BundleFunction } from '../types.js'

import { processESM } from './es_modules.js'

// @ts-expect-error vitest with esbuild already resolves the default export, whereas Node.js does not
const resolveDependency: typeof nftResolveDependency.default = nftResolveDependency.default
  ? nftResolveDependency.default
  : nftResolveDependency

// Paths that will be excluded from the tracing process.
const ignore = ['node_modules/aws-sdk/**']

const appearsToBeModuleName = (name: string) => !name.startsWith('.')

const bundle: BundleFunction = async ({
  basePath,
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot = basePath,
}) => {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath || basePath,
  )
  const {
    moduleFormat,
    paths: dependencyPaths,
    rewrites,
  } = await traceFilesAndTranspile({
    basePath: repositoryRoot,
    config,
    featureFlags,
    mainFile,
    pluginsModulesPath,
    name,
  })
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)
  const filteredIncludedPaths = [...filterExcludedPaths(dependencyPaths, excludePatterns), ...includedPaths]
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  // Sorting the array to make the checksum deterministic.
  const srcFiles = [...filteredIncludedPaths].sort()

  return {
    basePath: getBasePath(dirnames),
    includedFiles: includedPaths,
    inputs: dependencyPaths,
    mainFile,
    moduleFormat,
    rewrites,
    srcFiles,
  }
}

const ignoreFunction = (path: string) => {
  const shouldIgnore = ignore.some((expression) => minimatch(path, expression))

  return shouldIgnore
}

const traceFilesAndTranspile = async function ({
  basePath,
  config,
  featureFlags,
  mainFile,
  pluginsModulesPath,
  name,
}: {
  basePath?: string
  config: FunctionConfig
  featureFlags: FeatureFlags
  mainFile: string
  pluginsModulesPath?: string
  name: string
}) {
  const fsCache: FsCache = {}
  const {
    fileList: dependencyPaths,
    esmFileList,
    reasons,
  } = await nodeFileTrace([mainFile], {
    base: basePath,
    ignore: ignoreFunction,
    readFile: async (path: string) => {
      try {
        const source = (await cachedReadFile(fsCache, path, 'utf8')) as string

        return source
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
          return null
        }

        throw error
      }
    },
    resolve: async (specifier, parent, ...args) => {
      try {
        return await resolveDependency(specifier, parent, ...args)
      } catch (error) {
        // If we get a `MODULE_NOT_FOUND` error for what appears to be a module
        // name, we try to resolve it a second time using `pluginsModulesPath`
        // as the base directory.
        if (error.code === 'MODULE_NOT_FOUND' && pluginsModulesPath && appearsToBeModuleName(specifier)) {
          const newParent = join(pluginsModulesPath, basename(parent))

          return await resolveDependency(specifier, newParent, ...args)
        }

        throw error
      }
    },
  })
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )
  const { moduleFormat, rewrites } = await processESM({
    basePath,
    config,
    esmPaths: esmFileList,
    featureFlags,
    fsCache,
    mainFile,
    reasons,
    name,
  })

  return {
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
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], { base: basePath, ignore: ignoreFunction })
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
