/* eslint-disable max-lines */
import { dirname, basename, normalize } from 'path'
import * as process from 'process'

import { not as notJunk } from 'junk'
import precinct from 'precinct'
import semver from 'semver'

import { FeatureFlags } from '../../../../feature_flags.js'
import { nonNullable } from '../../../../utils/non_nullable.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import { getPackageJson, PackageJson } from '../../utils/package_json.js'
import { getNewCache, TraversalCache } from '../../utils/traversal_cache.js'
import type { GetSrcFilesFunction } from '../index.js'

import { listImports } from './list_imports.js'
import { resolvePathPreserveSymlinks } from './resolve.js'
import { getDependencyPathsForDependency } from './traverse.js'
import { getTreeFiles } from './tree_files.js'
import { shouldTreeShake } from './tree_shake.js'

// Retrieve the paths to the Node.js files to zip.
// We only include the files actually needed by the function because AWS Lambda
// has a size limit for the zipped file. It also makes cold starts faster.
export const getSrcFiles: GetSrcFilesFunction = async function ({
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const [treeFiles, depFiles] = await Promise.all([
    getTreeFiles(srcPath, stat),
    getDependencies({ featureFlags, functionName: name, mainFile, pluginsModulesPath, srcDir }),
  ])
  const files = [...treeFiles, ...depFiles].map(normalize)
  const uniqueFiles = [...new Set(files)]

  // We sort so that the archive's checksum is deterministic.
  // Mutating is fine since `Array.filter()` returns a shallow copy
  const filteredFiles = uniqueFiles.filter(isNotJunk).sort()
  const includedPaths = filterExcludedPaths([...filteredFiles, ...includedFilePaths], excludedPaths)

  return includedPaths
}

// Remove temporary files like *~, *.swp, etc.
const isNotJunk = function (file: string) {
  return notJunk(basename(file))
}

// Retrieve all the files recursively required by a Node.js file
const getDependencies = async function ({
  featureFlags,
  functionName,
  mainFile,
  pluginsModulesPath,
  srcDir,
}: {
  featureFlags: FeatureFlags
  functionName: string
  mainFile: string
  pluginsModulesPath?: string
  srcDir: string
}) {
  const packageJson = await getPackageJson(srcDir)
  const state = getNewCache()

  try {
    return await getFileDependencies({
      featureFlags,
      functionName,
      path: mainFile,
      packageJson,
      pluginsModulesPath,
      state,
    })
  } catch (error) {
    error.message = `In file "${mainFile}"\n${error.message}`
    throw error
  }
}

const paperwork = async (path: string) => {
  if (semver.lt(process.version, '18.0.0')) {
    return await precinct.paperwork(path, { includeCore: false })
  }

  // for Node v18, we're temporarily using our own mechanism to filter out core dependencies, until
  // https://github.com/dependents/node-precinct/pull/108 landed
  const modules = await precinct.paperwork(path, { includeCore: true })
  return modules.filter((moduleName) => {
    if (moduleName.startsWith('node:')) {
      return false
    }

    // only require("node:test") refers to the
    // builtin, require("test") doesn't
    if (moduleName === 'test') {
      return true
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const isNativeModule = moduleName in (process as any).binding('natives')

    return !isNativeModule
  })
}

const getFileDependencies = async function ({
  featureFlags,
  functionName,
  path,
  packageJson,
  pluginsModulesPath,
  state,
  treeShakeNext = false,
}: {
  featureFlags: FeatureFlags
  functionName: string
  path: string
  packageJson: PackageJson
  pluginsModulesPath?: string
  state: TraversalCache
  treeShakeNext?: boolean
}): Promise<string[]> {
  if (state.localFiles.has(path)) {
    return []
  }

  state.localFiles.add(path)

  const basedir = dirname(path)
  const dependencies = featureFlags.parseWithEsbuild ? await listImports({ functionName, path }) : await paperwork(path)

  const depsPaths = await Promise.all(
    dependencies.filter(nonNullable).map((dependency) =>
      getImportDependencies({
        dependency,
        basedir,
        featureFlags,
        functionName,
        packageJson,
        pluginsModulesPath,
        state,
        treeShakeNext,
      }),
    ),
  )

  return depsPaths.flat()
}

const getImportDependencies = function ({
  dependency,
  basedir,
  featureFlags,
  functionName,
  packageJson,
  pluginsModulesPath,
  state,
  treeShakeNext,
}: {
  dependency: string
  basedir: string
  featureFlags: FeatureFlags
  functionName: string
  packageJson: PackageJson
  pluginsModulesPath?: string
  state: TraversalCache
  treeShakeNext: boolean
}): Promise<string[]> {
  const shouldTreeShakeNext = treeShakeNext || isNextOnNetlify(dependency)
  if (shouldTreeShake(dependency, shouldTreeShakeNext)) {
    return getTreeShakedDependencies({
      dependency,
      basedir,
      featureFlags,
      functionName,
      packageJson,
      pluginsModulesPath,
      state,
      treeShakeNext: shouldTreeShakeNext,
    })
  }

  return getDependencyPathsForDependency({ dependency, basedir, state, packageJson, pluginsModulesPath })
}

const isNextOnNetlify = function (dependency: string) {
  return basename(dependency, '.js') === 'renderNextPage'
}

// When a file requires another one, we apply the top-level logic recursively
const getTreeShakedDependencies = async function ({
  dependency,
  basedir,
  featureFlags,
  functionName,
  packageJson,
  pluginsModulesPath,
  state,
  treeShakeNext,
}: {
  dependency: string
  basedir: string
  featureFlags: FeatureFlags
  functionName: string
  packageJson: PackageJson
  pluginsModulesPath?: string
  state: TraversalCache
  treeShakeNext: boolean
}) {
  const path = await resolvePathPreserveSymlinks(dependency, [basedir, pluginsModulesPath].filter(nonNullable))
  const depsPath = await getFileDependencies({
    featureFlags,
    functionName,
    path,
    packageJson,
    pluginsModulesPath,
    state,
    treeShakeNext,
  })
  return [path, ...depsPath]
}
/* eslint-enable max-lines */
