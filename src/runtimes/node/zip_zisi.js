const { dirname, normalize } = require('path')

const { JS_BUNDLER_ZISI } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { getSrcFiles } = require('./src_files')
const { getBasePath } = require('./utils/base_path')

const zipZisi = async ({
  archiveFormat,
  basePath,
  config,
  destFolder,
  extension,
  featureFlags,
  filename,
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
  const path = await zipNodeJs({
    archiveFormat,
    basePath: getBasePath(dirnames),
    destFolder,
    extension,
    filename,
    mainFile,
    pluginsModulesPath,
    srcFiles,
  })

  return { bundler: JS_BUNDLER_ZISI, config, inputs: srcFiles, path }
}

module.exports = { zipZisi }
