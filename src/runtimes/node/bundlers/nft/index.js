const { dirname, normalize, resolve } = require('path')

const { nodeFileTrace } = require('@vercel/nft')

const { getBasePath } = require('../../utils/base_path')
const { filterExcludedPaths, getPathsOfIncludedFiles } = require('../../utils/included_files')

const bundle = async ({
  basePath,
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot = basePath,
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
    featureFlags,
    mainFile,
    name,
    pluginsModulesPath,
    repositoryRoot,
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

const getSrcFiles = async function ({ basePath, config, mainFile }) {
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

module.exports = { bundle, getSrcFiles }
