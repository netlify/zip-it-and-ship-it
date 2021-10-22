import { basename, dirname, join, normalize, resolve } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import resolveDependency from '@vercel/nft/out/resolve-dependency'

import type { BundleFunction } from '..'
import type { FunctionConfig } from '../../../../config'
import { cachedReadFile, FsCache, safeUnlink } from '../../../../utils/fs'
import type { GetSrcFilesFunction } from '../../../runtime'
import { getBasePath } from '../../utils/base_path'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files'

import { transpileMany } from './transpile'

interface NftCache {
  analysisCache?: Map<string, { isESM: boolean; [key: string]: unknown }>
  [key: string]: unknown
}

const appearsToBeModuleName = (name: string) => !name.startsWith('.')

const bundle: BundleFunction = async ({
  basePath,
  config,
  mainFile,
  pluginsModulesPath,
  repositoryRoot = basePath,
}) => {
  const { includedFiles = [], includedFilesBasePath } = config
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath || basePath,
  )
  const {
    cleanupFunction,
    paths: dependencyPaths,
    transpilation,
  } = await traceFilesAndTranspile({
    basePath: repositoryRoot,
    config,
    mainFile,
    pluginsModulesPath,
  })
  const filteredIncludedPaths = filterExcludedPaths([...dependencyPaths, ...includedFilePaths], excludedPaths)
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  return {
    aliases: transpilation,
    basePath: getBasePath(dirnames),
    cleanupFunction,
    inputs: dependencyPaths,
    mainFile,
    srcFiles: [...filteredIncludedPaths, ...transpilation.keys()],
  }
}

const traceFilesAndTranspile = async function ({
  basePath,
  config,
  mainFile,
  pluginsModulesPath,
}: {
  basePath?: string
  config: FunctionConfig
  mainFile: string
  pluginsModulesPath?: string
}) {
  const fsCache: FsCache = {}
  const cache: NftCache = {}
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], {
    base: basePath,
    cache,
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
  const normalizedDependencyPaths = dependencyPaths.map((path) => (basePath ? resolve(basePath, path) : resolve(path)))

  // We look at the cache object to find any paths corresponding to ESM files.
  const esmPaths = [...(cache.analysisCache?.entries() || [])].filter(([, { isESM }]) => isESM).map(([path]) => path)

  // After transpiling the ESM files, we get back a `Map` mapping the path of
  // each transpiled to its original path.
  const transpilation = await transpileMany(esmPaths, config)

  // Creating a `Set` with the original paths of the transpiled files so that
  // we can do a O(1) lookup.
  const originalPaths = new Set(transpilation.values())

  // We remove the transpiled paths from the list of traced files, otherwise we
  // would end up with duplicate files in the archive.
  const filteredDependencyPaths = normalizedDependencyPaths.filter((path) => !originalPaths.has(path))

  // The cleanup function will delete all the temporary files that were created
  // as part of the transpilation process.
  const cleanupFunction = async () => {
    await Promise.all([...transpilation.keys()].map(safeUnlink))
  }

  return {
    cleanupFunction,
    paths: filteredDependencyPaths,
    transpilation,
  }
}

const getSrcFiles: GetSrcFilesFunction = async function ({ basePath, config, mainFile }) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], { base: basePath })
  const normalizedDependencyPaths = dependencyPaths.map((path) => (basePath ? resolve(basePath, path) : resolve(path)))
  const includedPaths = filterExcludedPaths([...normalizedDependencyPaths, ...includedFilePaths], excludedPaths)

  return includedPaths
}

const bundler = { bundle, getSrcFiles }

export default bundler
