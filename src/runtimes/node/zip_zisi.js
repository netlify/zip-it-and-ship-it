const { dirname, normalize } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { JS_BUNDLER_ZISI } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { getSrcFilesAndExternalModules } = require('./src_files')

const zipZisi = async ({
  archiveFormat,
  config,
  destFolder,
  extension,
  filename,
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    bundler: JS_BUNDLER_ZISI,
    extension,
    includedFiles: config.includedFiles,
    includedFilesBasePath: config.includedFilesBasePath,
    mainFile,
    pluginsModulesPath,
    srcDir,
    srcPath,
    stat,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))
  const path = await zipNodeJs({
    archiveFormat,
    basePath: commonPathPrefix(dirnames),
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
