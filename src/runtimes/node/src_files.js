const { normalize, resolve } = require('path')
const { promisify } = require('util')

const glob = require('glob')
const minimatch = require('minimatch')

const pGlob = promisify(glob)

const { getDependencyNamesAndPathsForDependencies, listFilesUsingLegacyBundler } = require('../../node_dependencies')
const { JS_BUNDLER_ZISI } = require('../../utils/consts')

// Returns the subset of `paths` that don't match any of the glob expressions
// from `exclude`.
const filterExcludedPaths = (paths, exclude = []) => {
  if (exclude.length === 0) {
    return paths
  }

  const excludedPaths = paths.filter((path) => !exclude.some((pattern) => minimatch(path, pattern)))

  return excludedPaths
}

const getPathsOfIncludedFiles = async (includedFiles, basePath) => {
  // Some of the globs in `includedFiles` might be exclusion patterns, which
  // means paths that should NOT be included in the bundle. We need to treat
  // these differently, so we iterate on the array and put those paths in a
  // `exclude` array and the rest of the paths in an `include` array.
  const { include, exclude } = includedFiles.reduce(
    (acc, path) => {
      if (path.startsWith('!')) {
        const excludePath = resolve(basePath, path.slice(1))

        return {
          ...acc,
          exclude: [...acc.exclude, excludePath],
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
    include.map((expression) => pGlob(expression, { absolute: true, cwd: basePath, ignore: exclude, nodir: true })),
  )

  // `pathGroups` is an array containing the paths for each expression in the
  // `include` array. We flatten it into a single dimension.
  const paths = pathGroups.flat()
  const normalizedPaths = paths.map(normalize)

  return { exclude, paths: [...new Set(normalizedPaths)] }
}

const getSrcFiles = async function ({ config, ...parameters }) {
  const { paths } = await getSrcFilesAndExternalModules({
    ...parameters,
    externalNodeModules: config.externalNodeModules,
  })

  return paths
}

const getSrcFilesAndExternalModules = async function ({
  bundler,
  externalNodeModules = [],
  featureFlags,
  includedFiles = [],
  includedFilesBasePath,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) {
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )

  if (bundler === JS_BUNDLER_ZISI) {
    const dependencyPaths = await listFilesUsingLegacyBundler({
      featureFlags,
      srcPath,
      mainFile,
      name,
      srcDir,
      stat,
      pluginsModulesPath,
    })
    const includedPaths = filterExcludedPaths([...dependencyPaths, ...includedFilePaths], excludedPaths)

    return {
      moduleNames: [],
      paths: includedPaths,
    }
  }

  const { moduleNames, paths: dependencyPaths } = await getDependencyNamesAndPathsForDependencies({
    dependencies: externalNodeModules,
    basedir: srcDir,
    pluginsModulesPath,
  })
  const includedPaths = filterExcludedPaths([...dependencyPaths, ...includedFilePaths], excludedPaths)

  return { moduleNames, paths: [...includedPaths, mainFile] }
}

module.exports = { getSrcFiles, getSrcFilesAndExternalModules }
