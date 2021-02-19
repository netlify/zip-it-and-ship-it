const { basename, dirname, join, normalize } = require('path')

const commonPathPrefix = require('common-path-prefix')

const { bundleJsFile } = require('../bundler')
const {
  getDependencyNamesAndPathsForDependencies,
  getExternalAndIgnoredModulesFromSpecialCases,
  listFilesUsingLegacyBundler,
} = require('../node_dependencies')
const { zipNodeJs } = require('../zip_node')

const getSrcFiles = async function (options) {
  const { paths } = await getSrcFilesAndExternalModules(options)

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  srcPath,
  mainFile,
  srcDir,
  stat,
  pluginsModulesPath,
  useEsbuild,
  externalModules,
}) {
  if (!useEsbuild) {
    const paths = await listFilesUsingLegacyBundler({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })

    return {
      moduleNames: [],
      paths,
    }
  }

  if (externalModules.length !== 0) {
    const { moduleNames, paths } = await getDependencyNamesAndPathsForDependencies({
      dependencies: externalModules,
      basedir: srcDir,
      pluginsModulesPath,
    })

    return { moduleNames, paths }
  }

  return {
    moduleNames: externalModules,
    paths: [],
  }
}

const zipFunction = async function ({
  destFolder,
  extension,
  externalModules: externalModulesFromConfig,
  filename,
  ignoredModules: ignoredModulesFromConfig,
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
  useEsbuild,
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
    useEsbuild,
    externalModules: externalModulesFromConfig,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))

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
