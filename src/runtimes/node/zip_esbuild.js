const { dirname, normalize } = require('path')

const { JS_BUNDLER_ESBUILD } = require('../../utils/consts')
const { getPathWithExtension } = require('../../utils/fs')
const { zipNodeJs } = require('../../zip_node')

const { bundleJsFile } = require('./bundlers/esbuild')
const { getExternalAndIgnoredModulesFromSpecialCases } = require('./bundlers/esbuild/special_cases')
const { getSrcFiles } = require('./src_files')
const { getBasePath } = require('./utils/base_path')

const getFunctionBasePath = ({ basePathFromConfig, mainFile, supportingSrcFiles }) => {
  // If there is a base path defined in the config, we use that.
  if (basePathFromConfig !== undefined) {
    return basePathFromConfig
  }

  // If not, the base path is the common path prefix between all the supporting
  // files and the main file.
  const dirnames = [...supportingSrcFiles, mainFile].map((filePath) => normalize(dirname(filePath)))

  return getBasePath(dirnames)
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
  basePath,
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
    additionalPaths,
    bundlePaths,
    cleanTempFiles,
    inputs,
    nativeNodeModules = {},
    nodeModulesWithDynamicImports,
    warnings,
  } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    basePath,
    config,
    destFilename: filename,
    externalModules,
    ignoredModules,
    name,
    srcDir,
    srcFile: mainFile,
  })
  const bundlerWarnings = warnings.length === 0 ? undefined : warnings
  const srcFiles = await getSrcFiles({
    bundler: JS_BUNDLER_ESBUILD,
    config: {
      ...config,
      externalNodeModules: [...externalModules, ...Object.keys(nativeNodeModules)],
      includedFiles: [...(config.includedFiles || []), ...additionalPaths],
      includedFilesBasePath: config.includedFilesBasePath || basePath,
    },
    mainFile,
    name,
    srcPath,
    srcDir,
    pluginsModulesPath,
    stat,
  })

  // We want to remove `mainFile` from `srcFiles` because it represents the
  // path of the original, pre-bundling function file. We'll add the actual
  // bundled file further below.
  const supportingSrcFiles = srcFiles.filter((path) => path !== mainFile)
  const normalizedMainFile = getPathWithExtension(mainFile, '.js')
  const functionBasePath = getFunctionBasePath({ basePathFromConfig: basePath, mainFile, supportingSrcFiles })

  try {
    const path = await zipNodeJs({
      aliases: bundlePaths,
      archiveFormat,
      basePath: functionBasePath,
      destFolder,
      extension,
      filename,
      mainFile: normalizedMainFile,
      pluginsModulesPath,
      srcFiles: [...supportingSrcFiles, ...bundlePaths.keys()],
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
