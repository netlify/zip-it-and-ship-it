const { dirname, format, normalize, parse } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { getExternalAndIgnoredModulesFromSpecialCases } = require('../../node_dependencies')
const { JS_BUNDLER_ESBUILD } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { bundleJsFile } = require('./bundler')
const { getSrcFilesAndExternalModules } = require('./src_files')

const zipEsbuild = async ({
  destFolder,
  destPath,
  extension,
  filename,
  jsExternalModules: externalModulesFromConfig = [],
  jsIgnoredModules: ignoredModulesFromConfig = [],
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const {
    externalModules: externalModulesFromSpecialCases,
    ignoredModules: ignoredModulesFromSpecialCases,
  } = await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })
  const externalModules = [...new Set([...externalModulesFromConfig, ...externalModulesFromSpecialCases])]
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    extension,
    jsBundler: JS_BUNDLER_ESBUILD,
    jsExternalModules: externalModules,
    mainFile,
    srcPath,
    srcDir,
    pluginsModulesPath,
    stat,
  })

  const { bundlePath, data, cleanTempFiles } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    destFilename: filename,
    destFolder,
    externalModules,
    ignoredModules: [...ignoredModulesFromConfig, ...ignoredModulesFromSpecialCases],
    srcDir,
    srcFile: mainFile,
  })
  const bundlerWarnings = data.warnings.length === 0 ? undefined : data.warnings

  // We want to remove `mainFile` from `srcFiles` because it represents the
  // path of the original, pre-bundling function file. We'll add the actual
  // bundled file further below.
  const supportingSrcFiles = srcFiles.filter((path) => path !== mainFile)

  // Normalizing the main file so that it has a .js extension.
  const normalizedMainFile = format({ ...parse(mainFile), base: undefined, ext: '.js' })

  // We're adding the bundled file to the zip, but we want it to have the same
  // name and path as the original, unbundled file. For this, we use an alias.
  const aliases = {
    [bundlePath]: normalizedMainFile,
  }

  const dirnames = supportingSrcFiles.map((filePath) => normalize(dirname(filePath)))
  const basePath = commonPathPrefix([...dirnames, normalize(dirname(mainFile))])

  try {
    await zipNodeJs({
      aliases,
      basePath,
      destFolder,
      destPath,
      filename,
      mainFile: normalizedMainFile,
      pluginsModulesPath,
      srcFiles: [...supportingSrcFiles, bundlePath],
    })
  } finally {
    await cleanTempFiles()
  }

  return { bundler: JS_BUNDLER_ESBUILD, bundlerWarnings, path: destPath }
}

module.exports = { zipEsbuild }
