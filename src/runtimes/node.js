const { basename, dirname, join } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { bundleJsFile } = require('../bundler')
const { getDependencies, listFilesUsingLegacyBundler } = require('../node_dependencies')
const { zipNodeJs } = require('../zip_node')

const getSrcFiles = function ({ srcPath, mainFile, srcDir, stat, pluginsModulesPath, useEsbuild, externalModules }) {
  if (!useEsbuild) {
    return listFilesUsingLegacyBundler({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })
  }

  if (externalModules.length !== 0) {
    return getDependencies(mainFile, srcDir, pluginsModulesPath, externalModules)
  }

  return []
}

const zipFunction = async function ({
  destFolder,
  extension,
  externalModules,
  filename,
  ignoredModules,
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
  useEsbuild,
}) {
  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)
  const srcFiles = await getSrcFiles({
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    useEsbuild,
    externalModules,
  })
  const dirnames = srcFiles.map(dirname)

  if (!useEsbuild) {
    await zipNodeJs({
      basePath: commonPathPrefix(dirnames),
      destFolder,
      destPath,
      filename,
      mainFile,
      pluginsModulesPath,
      srcFiles,
    })

    return destPath
  }

  const { bundlePath, cleanTempFiles } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    destFilename: filename,
    destFolder,
    externalModules,
    ignoredModules,
    srcFile: mainFile,
  })

  // We're adding the bundled file to the zip, but we want it to have the same
  // name and path as the original, unbundled file. For this, we use a rename.
  const renames = {
    [bundlePath]: mainFile,
  }
  const basePath = commonPathPrefix([...dirnames, dirname(mainFile)])

  try {
    await zipNodeJs({
      basePath,
      destFolder,
      destPath,
      filename,
      mainFile,
      pluginsModulesPath,
      renames,
      srcFiles: [...srcFiles, bundlePath],
    })
  } finally {
    await cleanTempFiles()
  }

  return destPath
}

module.exports = { getSrcFiles, zipFunction }
