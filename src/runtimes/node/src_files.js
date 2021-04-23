const { promisify } = require('util')

const glob = require('glob')

const pGlob = promisify(glob)

const { getDependencyNamesAndPathsForDependencies, listFilesUsingLegacyBundler } = require('../../node_dependencies')
const { JS_BUNDLER_ZISI } = require('../../utils/consts')

const getPathsOfIncludedFiles = async (includedFiles, basePath) => {
  // Some of the globs in `includedFiles` might be exclusion patterns, which
  // means paths that should NOT be included in the bundle. We need to treat
  // these differently, so we iterate on the array and put those paths in a
  // `exclude` array and the rest of the paths in an `include` array.
  const { include, exclude } = includedFiles.reduce(
    (acc, path) => {
      if (path.startsWith('!')) {
        return {
          ...acc,
          exclude: [...acc.exclude, path.slice(1)],
        }
      }

      return {
        ...acc,
        include: [...acc.include, path],
      }
    },
    { include: [], exclude: [] },
  )
  const pathGroups = await Promise.all(
    include.map((expression) => pGlob(expression, { absolute: true, cwd: basePath, ignore: exclude })),
  )

  // `pathGroups` is an array containing the paths for each expression in the
  // `include` array. We flatten it into a single dimension.
  const paths = pathGroups.flat()

  return [...new Set(paths)]
}

const getSrcFiles = async function ({ config, ...parameters }) {
  const { paths } = await getSrcFilesAndExternalModules({
    ...parameters,
    bundler: config.nodeBundler || JS_BUNDLER_ZISI,
    externalNodeModules: config.externalNodeModules,
  })

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  bundler,
  externalNodeModules = [],
  includedFiles = [],
  includedFilesBasePath,
  mainFile,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) {
  const includedFilePaths = await getPathsOfIncludedFiles(includedFiles, includedFilesBasePath)

  if (bundler === JS_BUNDLER_ZISI) {
    const paths = await listFilesUsingLegacyBundler({ srcPath, mainFile, srcDir, stat, pluginsModulesPath })

    return {
      moduleNames: [],
      paths: [...paths, ...includedFilePaths],
    }
  }

  if (externalNodeModules.length !== 0) {
    const { moduleNames, paths } = await getDependencyNamesAndPathsForDependencies({
      dependencies: externalNodeModules,
      basedir: srcDir,
      pluginsModulesPath,
    })

    return { moduleNames, paths: [...paths, ...includedFilePaths, mainFile] }
  }

  return {
    moduleNames: externalNodeModules,
    paths: [mainFile, ...includedFilePaths],
  }
}

module.exports = { getSrcFiles, getSrcFilesAndExternalModules }
