const { dirname, normalize } = require('path')

const { JS_BUNDLER_ZISI } = require('../../../../utils/consts')
const { getSrcFiles } = require('../../src_files')
const { getBasePath } = require('../../utils/base_path')

const bundle = async ({
  basePath,
  config,
  extension,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const srcFiles = await getSrcFiles({
    bundler: JS_BUNDLER_ZISI,
    config: {
      ...config,
      includedFilesBasePath: config.includedFilesBasePath || basePath,
    },
    extension,
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
    mainFile,
    srcFiles,
  }
}

module.exports = { bundle }
