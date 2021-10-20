import { dirname, normalize, resolve } from 'path'

import { nodeFileTrace } from '@vercel/nft'

import type { BundleFunction } from '..'
import type { GetSrcFilesFunction } from '../../../runtime'
import { getBasePath } from '../../utils/base_path'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files'

const bundle: BundleFunction = async ({
  basePath,
  config,
  extension,
  featureFlags,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot = basePath,
  runtime,
  srcDir,
  srcPath,
  stat,
}) => {
  const srcFiles = await getSrcFiles({
    basePath: repositoryRoot,
    config: {
      ...config,
      includedFilesBasePath: config.includedFilesBasePath || basePath,
    },
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
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath))).sort()

  return {
    basePath: getBasePath(dirnames),
    inputs: srcFiles,
    mainFile,
    srcFiles,
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
