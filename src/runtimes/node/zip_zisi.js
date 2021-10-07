const { dirname, normalize } = require('path')

const { JS_BUNDLER_ZISI } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { getSrcFilesAndExternalModules } = require('./src_files')
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
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    bundler: JS_BUNDLER_ZISI,
    extension,
    featureFlags,
    includedFiles: config.includedFiles,
    includedFilesBasePath: config.includedFilesBasePath || basePath,
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
