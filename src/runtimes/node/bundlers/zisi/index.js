const { dirname, normalize } = require('path')

const { getBasePath } = require('../../utils/base_path')

const { getSrcFiles } = require('./src_files')

const bundle = async ({
  basePath,
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const srcFiles = await getSrcFiles({
    config: {
      ...config,
      includedFilesBasePath: config.includedFilesBasePath || basePath,
    },
    featureFlags,
    mainFile,
    name,
    pluginsModulesPath,
    srcDir,
    srcPath,
    stat,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))

  return {
    basePath: getBasePath(dirnames),
    inputs: srcFiles,
    mainFile,
    srcFiles,
  }
}

module.exports = { bundle, getSrcFiles }
