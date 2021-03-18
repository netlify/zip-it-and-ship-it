const { getDependencyNamesAndPathsForDependencies, listFilesUsingLegacyBundler } = require('../../node_dependencies')
const { JS_BUNDLER_ZISI } = require('../../utils/consts')

const getSrcFiles = async function (options) {
  const { paths } = await getSrcFilesAndExternalModules(options)

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  externalNodeModules = [],
  jsBundler,
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

  if (externalNodeModules.length !== 0) {
    const { moduleNames, paths } = await getDependencyNamesAndPathsForDependencies({
      dependencies: externalNodeModules,
      basedir: srcDir,
      pluginsModulesPath,
    })

    return { moduleNames, paths: [...paths, mainFile] }
  }

  return {
    moduleNames: externalNodeModules,
    paths: [mainFile],
  }
}

module.exports = { getSrcFiles, getSrcFilesAndExternalModules }
