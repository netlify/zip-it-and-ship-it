const { basename, dirname, join, normalize } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { bundleJsFile } = require('../bundler')
const {
  getDependencyNamesAndPathsForDependencies,
  getExternalAndIgnoredModulesFromSpecialCases,
  listFilesUsingLegacyBundler,
} = require('../node_dependencies')
const { JS_BUNDLER_ESBUILD, JS_BUNDLER_LEGACY } = require('../utils/consts')
const { zipNodeJs } = require('../zip_node')

const getSrcFiles = async function (options) {
  const { paths } = await getSrcFilesAndExternalModules(options)

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  jsBundlerVersion,
  jsExternalModules = [],
  srcPath,
  mainFile,
  srcDir,
  stat,
  pluginsModulesPath,
}) {
  if (jsBundlerVersion === JS_BUNDLER_LEGACY) {
    const paths = await listFilesUsingLegacyBundler({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })

    return {
      moduleNames: [],
      paths,
    }
  }

  if (jsExternalModules.length !== 0) {
    const { moduleNames, paths } = await getDependencyNamesAndPathsForDependencies({
      dependencies: jsExternalModules,
      basedir: srcDir,
      pluginsModulesPath,
    })

    return { moduleNames, paths: [...paths, mainFile] }
  }

  return {
    moduleNames: jsExternalModules,
    paths: [mainFile],
  }
}

const zipFunction = async function ({
  destFolder,
  extension,
  filename,
  jsBundlerVersion,
  jsExternalModules: externalModulesFromConfig = [],
  jsIgnoredModules: ignoredModulesFromConfig = [],
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) {
  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)

  // When a module is added to `externalModules`, we will traverse its main
  // file recursively and look for all its dependencies, so that we can ship
  // their files separately, inside a `node_modules` directory. Whenever we
  // process a module this way, we can also flag it as external with esbuild
  // since its source is already part of the artifact and there's no point in
  // inlining it again in the bundle.
  // As such, the dependency traversal logic will compile the names of these
  // modules in `additionalExternalModules`.
  const { moduleNames: externalModulesFromTraversal = [], paths: srcFiles } = await getSrcFilesAndExternalModules({
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    jsBundlerVersion,
    jsExternalModules: externalModulesFromConfig,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))

  if (jsBundlerVersion === JS_BUNDLER_LEGACY) {
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

  const {
    externalModules: externalModulesFromSpecialCases,
    ignoredModules: ignoredModulesFromSpecialCases,
  } = await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })

  const { bundlePath, cleanTempFiles } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    destFilename: filename,
    destFolder,
    externalModules: [
      ...externalModulesFromConfig,
      ...externalModulesFromSpecialCases,
      ...externalModulesFromTraversal,
    ],
    ignoredModules: [...ignoredModulesFromConfig, ...ignoredModulesFromSpecialCases],
    srcFile: mainFile,
  })

  // We're adding the bundled file to the zip, but we want it to have the same
  // name and path as the original, unbundled file. For this, we use an alias..
  const aliases = {
    [mainFile]: bundlePath,
  }
  const basePath = commonPathPrefix([...dirnames, dirname(mainFile)])

  try {
    await zipNodeJs({
      aliases,
      basePath,
      destFolder,
      destPath,
      filename,
      mainFile,
      pluginsModulesPath,
      srcFiles,
    })
  } finally {
    await cleanTempFiles()
  }

  return destPath
}

const zipWithFunctionWithFallback = async (parameters) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (parameters.jsBundlerVersion) {
    return zipFunction(parameters)
  }

  // Otherwise, we'll try to bundle with v2 and, if that fails, fallback to v1.
  try {
    return await zipFunction({ ...parameters, jsBundlerVersion: JS_BUNDLER_ESBUILD })
  } catch (_) {
    return zipFunction({ ...parameters, jsBundlerVersion: JS_BUNDLER_LEGACY })
  }
}

module.exports = { getSrcFiles, zipFunction: zipWithFunctionWithFallback }
