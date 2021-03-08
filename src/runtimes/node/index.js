const { basename, dirname, format, join, normalize, parse } = require('path')

const commonPathPrefix = require('common-path-prefix')
const cpFile = require('cp-file')

const { bundleJsFile } = require('../../node_bundler')
const {
  getDependencyNamesAndPathsForDependencies,
  getExternalAndIgnoredModulesFromSpecialCases,
  listFilesUsingLegacyBundler,
} = require('../../node_dependencies')
const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_ZISI, RUNTIME_JS } = require('../../utils/consts')
const { zipNodeJs } = require('../../zip_node')

const { findFunctionsInPaths } = require('./finder')

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

// eslint-disable-next-line max-statements
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
  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { path: destPath }
  }

  const destPath = join(destFolder, `${basename(filename, extension)}.zip`)
  const {
    externalModules: externalModulesFromSpecialCases,
    ignoredModules: ignoredModulesFromSpecialCases,
  } = await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })
  const externalModules = [...new Set([...externalModulesFromConfig, ...externalModulesFromSpecialCases])]
  const { paths: srcFiles } = await getSrcFilesAndExternalModules({
    stat,
    mainFile,
    extension,
    srcPath,
    srcDir,
    pluginsModulesPath,
    jsBundler,
    jsExternalModules: externalModules,
  })

  if (jsBundler === JS_BUNDLER_ZISI) {
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

module.exports = { findFunctionsInPaths, getSrcFiles, name: RUNTIME_JS, zipFunction: zipWithFunctionWithFallback }
