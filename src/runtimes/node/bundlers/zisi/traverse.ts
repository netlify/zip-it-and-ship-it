import { promises as fs } from 'fs'
import { dirname } from 'path'

import { nonNullable } from '../../../../utils/non_nullable.js'
import { getModuleName } from '../../utils/module.js'
import { PackageJson } from '../../utils/package_json.js'
import { TraversalCache } from '../../utils/traversal_cache.js'

import { getNestedDependencies, handleModuleNotFound } from './nested.js'
import { getPublishedFiles } from './published.js'
import { resolvePackage } from './resolve.js'
import { getSideFiles } from './side_files.js'

const EXCLUDED_MODULES = new Set(['aws-sdk'])

// When a file requires a module, we find its path inside `node_modules` and
// use all its published files. We also recurse on the module's dependencies.
export const getDependencyPathsForDependency = async function ({
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
  const packageJson = JSON.parse(await fs.readFile(packagePath, 'utf8'))

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
