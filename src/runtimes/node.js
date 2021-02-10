const { join, basename } = require('path')

const cpFile = require('cp-file')

const { zipNodeJs } = require('../zip_node')

const zipJsFunction = async function ({
  srcPath,
  destFolder,
  mainFile,
  filename,
  extension,
  srcFiles,
  pluginsModulesPath,
  useEsbuild,
  externalModules,
}) {
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return destPath
  }

  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)
  await zipNodeJs({
    srcFiles,
    destFolder,
    destPath,
    filename,
    mainFile,
    pluginsModulesPath,
    useEsbuild,
    externalModules,
  })
  return destPath
}

module.exports = { zipJsFunction }
