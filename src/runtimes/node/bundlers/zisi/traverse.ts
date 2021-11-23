import { dirname } from 'path'

import { nonNullable } from '../../../../utils/non_nullable'
import { getModuleName } from '../../utils/module'
import { PackageJson } from '../../utils/package_json'
import { TraversalCache } from '../../utils/traversal_cache'

import { getNestedDependencies, handleModuleNotFound } from './nested'
import { getPublishedFiles } from './published'
import { resolvePackage } from './resolve'
import { getSideFiles } from './side_files'

const EXCLUDED_MODULES = new Set(['aws-sdk'])

// When a file requires a module, we find its path inside `node_modules` and
// use all its published files. We also recurse on the module's dependencies.
const getDependencyPathsForDependency = async function ({
  dependency,
  basedir,
  state,
  packageJson,
  pluginsModulesPath,
}: {
  dependency: string
  basedir: string
  state: TraversalCache
  packageJson: PackageJson
  pluginsModulesPath?: string
}): Promise<string[]> {
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

const getDependenciesForModuleName = async function ({
  moduleName,
  basedir,
  state,
  pluginsModulesPath,
}: {
  moduleName: string
  basedir: string
  state: TraversalCache
  pluginsModulesPath?: string
}): Promise<string[]> {
  if (isExcludedModule(moduleName)) {
    return []
  }

  // Find the Node.js module directory path
  const packagePath = await resolvePackage(moduleName, [basedir, pluginsModulesPath].filter(nonNullable))

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
  // eslint-disable-next-line import/no-dynamic-require, node/global-require, @typescript-eslint/no-var-requires
  const packageJson = require(packagePath)

  const [publishedFiles, sideFiles, depsPaths] = await Promise.all([
    getPublishedFiles(modulePath),
    getSideFiles(modulePath, moduleName),
    getNestedModules({ modulePath, state, packageJson, pluginsModulesPath }),
  ])
  return [...publishedFiles, ...sideFiles, ...depsPaths]
}

const isExcludedModule = function (moduleName: string): boolean {
  return EXCLUDED_MODULES.has(moduleName) || moduleName.startsWith('@types/')
}

const getNestedModules = async function ({
  modulePath,
  state,
  packageJson,
  pluginsModulesPath,
}: {
  modulePath: string
  state: TraversalCache
  packageJson: PackageJson
  pluginsModulesPath?: string
}) {
  const dependencies = getNestedDependencies(packageJson)

  const depsPaths = await Promise.all(
    dependencies.map((dependency) =>
      getDependencyPathsForDependency({ dependency, basedir: modulePath, state, packageJson, pluginsModulesPath }),
    ),
  )
  return depsPaths.flat()
}

export { getDependencyPathsForDependency }
