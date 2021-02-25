const { basename, dirname, join, normalize } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { bundleJsFile } = require('../bundler')
const {
  getDependencyNamesAndPathsForDependencies,
  getExternalAndIgnoredModulesFromSpecialCases,
  listFilesUsingLegacyBundler,
} = require('../node_dependencies')
const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_ZISI } = require('../utils/consts')
const { zipNodeJs } = require('../zip_node')

const getSrcFiles = async function (options) {
  const { paths } = await getSrcFilesAndExternalModules(options)

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  jsBundler,
  jsExternalModules = [],
  srcPath,
  mainFile,
  srcDir,
  stat,
  pluginsModulesPath,
}) {
  if (jsBundler === JS_BUNDLER_ZISI) {
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
  jsBundler = JS_BUNDLER_ZISI,
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
    jsBundler,
    jsExternalModules: externalModulesFromConfig,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))

  if (jsBundler === JS_BUNDLER_ZISI) {
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

  const {
    externalModules: externalModulesFromSpecialCases,
    ignoredModules: ignoredModulesFromSpecialCases,
  } = await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })

  const { bundlePath, data, cleanTempFiles } = await bundleJsFile({
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
  const bundlerWarnings = data.warnings.length === 0 ? undefined : data.warnings

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

  return { bundler: JS_BUNDLER_ESBUILD, bundlerWarnings, path: destPath }
}

const zipWithFunctionWithFallback = async ({ jsBundler, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (jsBundler !== JS_BUNDLER_ESBUILD_ZISI) {
    return zipFunction({ ...parameters, jsBundler })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, jsBundler: JS_BUNDLER_ESBUILD })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, jsBundler: JS_BUNDLER_ZISI })

      return { ...data, bundlerErrors: esbuildError.errors }
    } catch (zisiError) {
      throw esbuildError
    }
  }
}

module.exports = { getSrcFiles, zipFunction: zipWithFunctionWithFallback }
