import { basename, dirname, join, normalize, resolve } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import resolveDependency from '@vercel/nft/out/resolve-dependency'
import minimatch from 'minimatch'
import unixify from 'unixify'

import type { BundleFunction } from '..'
import type { FunctionConfig } from '../../../../config'
import { cachedReadFile, FsCache } from '../../../../utils/fs'
import type { GetSrcFilesFunction } from '../../../runtime'
import { getBasePath } from '../../utils/base_path'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files'

import { transpileESM } from './es_modules'

// Paths that will be excluded from the tracing process.
const ignore = ['node_modules/aws-sdk/**']

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
  const { paths: dependencyPaths, rewrites } = await traceFilesAndTranspile({
    basePath: repositoryRoot,
    config,
    mainFile,
    pluginsModulesPath,
  })
  const filteredIncludedPaths = filterExcludedPaths([...dependencyPaths, ...includedFilePaths], excludedPaths)
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  // Sorting the array to make the checksum deterministic.
  const srcFiles = [...filteredIncludedPaths].sort()

  return {
    basePath: getBasePath(dirnames),
    inputs: dependencyPaths,
    mainFile,
    rewrites,
    srcFiles,
  }
}

const ignoreFunction = (path: string) => {
  const normalizedPath = unixify(path)
  const shouldIgnore = ignore.some((expression) => minimatch(normalizedPath, expression))

  return shouldIgnore
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
  const rewrites = await transpileESM({ basePath, config, esmPaths: esmFileList, fsCache, reasons })

  return {
    paths: normalizedDependencyPaths,
    rewrites,
  }
}

const getSrcFiles: GetSrcFilesFunction = async function ({ basePath, config, mainFile }) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], { base: basePath, ignore: ignoreFunction })
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )
  const includedPaths = filterExcludedPaths([...normalizedDependencyPaths, ...includedFilePaths], excludedPaths)

  return includedPaths
}

const bundler = { bundle, getSrcFiles }

export default bundler
