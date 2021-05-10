const { dirname, format, join, normalize, relative, parse } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { getExternalAndIgnoredModulesFromSpecialCases } = require('../../node_dependencies')
const { JS_BUNDLER_ESBUILD } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { bundleJsFile } = require('./bundler')
const { getSrcFilesAndExternalModules } = require('./src_files')

const getAliases = ({ bundlePath, mainFile, sourcemapPath, srcDir }) => {
  const aliases = new Map([[bundlePath, mainFile]])

  if (sourcemapPath !== undefined) {
    const bundleDirectory = dirname(bundlePath)
    const relativeSourcemapPath = relative(bundleDirectory, sourcemapPath)

    aliases.set(sourcemapPath, join(srcDir, relativeSourcemapPath))
  }

  return aliases
}

// Convenience method for retrieving external and ignored modules from
// different places and merging them together.
const getExternalAndIgnoredModules = async ({ config, srcDir }) => {
  const { externalNodeModules: externalModulesFromConfig = [], ignoredNodeModules: ignoredModulesFromConfig = [] } =
    config
  const { externalModules: externalModulesFromSpecialCases, ignoredModules: ignoredModulesFromSpecialCases } =
    await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })
  const externalModules = [...new Set([...externalModulesFromConfig, ...externalModulesFromSpecialCases])]
  const ignoredModules = [...ignoredModulesFromConfig, ...ignoredModulesFromSpecialCases]

  return { externalModules, ignoredModules }
}

const zipEsbuild = async ({
  archiveFormat,
  config = {},
  destFolder,
  extension,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) => {
  const { externalModules, ignoredModules } = await getExternalAndIgnoredModules({ config, srcDir })
  const {
    bundlePath,
    cleanTempFiles,
    inputs,
    nativeNodeModules = {},
    nodeModulesWithDynamicImports,
    sourcemapPath,
    warnings,
  } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    config,
    destFilename: filename,
    destFolder,
    externalModules,
    ignoredModules,
    name,
    srcDir,
    srcFile: mainFile,
  })
  const bundlerWarnings = warnings.length === 0 ? undefined : warnings
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    externalNodeModules: [...externalModules, ...Object.keys(nativeNodeModules)],
    bundler: JS_BUNDLER_ESBUILD,
    includedFiles: config.includedFiles,
    includedFilesBasePath: config.includedFilesBasePath,
    mainFile,
    srcPath,
    srcDir,
    pluginsModulesPath,
    stat,
  })

  // We want to remove `mainFile` from `srcFiles` because it represents the
  // path of the original, pre-bundling function file. We'll add the actual
  // bundled file further below.
  const supportingSrcFiles = srcFiles.filter((path) => path !== mainFile)

  // Normalizing the main file so that it has a .js extension.
  const normalizedMainFile = format({ ...parse(mainFile), base: undefined, ext: '.js' })

  // We're adding the bundled file to the zip, but we want it to have the same
  // name and path as the original, unbundled file. For this, we use an alias.
  const aliases = getAliases({ bundlePath, mainFile: normalizedMainFile, sourcemapPath, srcDir })
  const dirnames = supportingSrcFiles.map((filePath) => normalize(dirname(filePath)))
  const basePath = commonPathPrefix([...dirnames, normalize(dirname(mainFile))])

  try {
    const path = await zipNodeJs({
      aliases,
      archiveFormat,
      basePath,
      destFolder,
      extension,
      filename,
      mainFile: normalizedMainFile,
      pluginsModulesPath,
      srcFiles: [...supportingSrcFiles, bundlePath, ...(sourcemapPath ? [sourcemapPath] : [])],
    })

    return {
      bundler: JS_BUNDLER_ESBUILD,
      bundlerWarnings,
      config,
      inputs,
      nativeNodeModules,
      nodeModulesWithDynamicImports,
      path,
    }
  } finally {
    await cleanTempFiles()
  }
}

module.exports = { zipEsbuild }
