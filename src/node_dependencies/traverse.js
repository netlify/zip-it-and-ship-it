const { dirname } = require('path')

const { getModuleName } = require('./module')
const { getNestedDependencies, handleModuleNotFound } = require('./nested')
const { getPackageJson } = require('./package_json')
const { getPublishedFiles } = require('./published')
const { resolvePackage } = require('./resolve')
const { getSideFiles } = require('./side_files')

const EXCLUDED_MODULES = new Set(['aws-sdk'])

// Local cache used for optimizing the traversal of module dependencies.
const getNewCache = () => ({ localFiles: new Set(), moduleNames: new Set(), modulePaths: new Set() })

// When a file requires a module, we find its path inside `node_modules` and
// use all its published files. We also recurse on the module's dependencies.
const getDependencyPathsForDependency = async function ({
  dependency,
  basedir,
  state,
  packageJson,
  pluginsModulesPath,
}) {
  const moduleName = getModuleName(dependency)

  // Happens when doing require("@scope") (not "@scope/name") or other oddities
  // Ignore those.
  if (moduleName === null) {
    return []
  }

  try {
    return await getDependenciesForModuleName({ moduleName, basedir, state, pluginsModulesPath })
  } catch (error) {
    return handleModuleNotFound({ error, moduleName, packageJson })
  }
}

const getDependencyNamesAndPathsForDependencies = async function ({
  dependencies: dependencyNames,
  basedir,
  state = getNewCache(),
  pluginsModulesPath,
}) {
  const packageJson = await getPackageJson(basedir)
  const dependencies = await Promise.all(
    dependencyNames.map((dependencyName) =>
      getDependencyNamesAndPathsForDependency({
        dependency: dependencyName,
        basedir,
        state,
        packageJson,
        pluginsModulesPath,
      }),
    ),
  )
  const moduleNames = new Set(dependencies.flatMap((dependency) => [...dependency.moduleNames]))
  const paths = new Set(dependencies.flatMap((dependency) => [...dependency.paths]))

  return {
    moduleNames: [...moduleNames],
    paths: [...paths],
  }
}

const getDependencyNamesAndPathsForDependency = async function ({
  dependency,
  basedir,
  state = getNewCache(),
  packageJson,
  pluginsModulesPath,
}) {
  try {
    const paths = await getDependencyPathsForDependency({ dependency, basedir, state, packageJson, pluginsModulesPath })

    return {
      moduleNames: [...state.moduleNames],
      paths,
    }
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return {
        moduleNames: [],
        paths: [],
      }
    }

    throw error
  }
}

const getDependenciesForModuleName = async function ({ moduleName, basedir, state, pluginsModulesPath }) {
  if (isExcludedModule(moduleName)) {
    return []
  }

  // Find the Node.js module directory path
  const packagePath = await resolvePackage(moduleName, [basedir, pluginsModulesPath].filter(Boolean))

  if (packagePath === undefined) {
    return []
  }

  const modulePath = dirname(packagePath)

  if (state.modulePaths.has(modulePath)) {
    return []
  }

  state.moduleNames.add(moduleName)
  state.modulePaths.add(modulePath)

  // The path depends on the user's build, i.e. must be dynamic
  // eslint-disable-next-line import/no-dynamic-require, node/global-require
  const packageJson = require(packagePath)

  const [publishedFiles, sideFiles, depsPaths] = await Promise.all([
    getPublishedFiles(modulePath),
    getSideFiles(modulePath, moduleName),
    getNestedModules({ modulePath, state, packageJson, pluginsModulesPath }),
  ])
  return [...publishedFiles, ...sideFiles, ...depsPaths]
}

const isExcludedModule = function (moduleName) {
  return EXCLUDED_MODULES.has(moduleName) || moduleName.startsWith('@types/')
}

const getNestedModules = async function ({ modulePath, state, packageJson, pluginsModulesPath }) {
  const dependencies = getNestedDependencies(packageJson)

  const depsPaths = await Promise.all(
    dependencies.map((dependency) =>
      getDependencyPathsForDependency({ dependency, basedir: modulePath, state, packageJson, pluginsModulesPath }),
    ),
  )
  // TODO: switch to Array.flat() once we drop support for Node.js < 11.0.0
  // eslint-disable-next-line unicorn/prefer-spread
  return [].concat(...depsPaths)
}

module.exports = {
  getDependencyPathsForDependency,
  getDependencyNamesAndPathsForDependencies,
  getDependencyNamesAndPathsForDependency,
  getNewCache,
}
