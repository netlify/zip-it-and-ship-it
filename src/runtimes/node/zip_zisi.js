const { dirname, normalize } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { JS_BUNDLER_ZISI } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { getSrcFilesAndExternalModules } = require('./src_files')

const zipZisi = async ({
  destFolder,
  destPath,
  extension,
  filename,
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    extension,
    jsBundler: JS_BUNDLER_ZISI,
    mainFile,
    pluginsModulesPath,
    srcDir,
    srcPath,
    stat,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))

  await zipNodeJs({
    basePath: commonPathPrefix(dirnames),
    destFolder,
    destPath,
    filename,
    mainFile,
    pluginsModulesPath,
    srcFiles,
  })

  return { bundler: JS_BUNDLER_ZISI, path: destPath }
}

module.exports = { zipZisi }
