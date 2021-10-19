import type { GetSrcFilesFunction } from '..'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files'
import { getPackageJson, PackageJson } from '../../utils/package_json'
import { getNewCache, TraversalCache } from '../../utils/traversal_cache'
import { getDependencyPathsForDependency } from '../zisi/traverse'

const getSrcFiles: GetSrcFilesFunction = async ({ config, mainFile, pluginsModulesPath, srcDir }) => {
  const { externalNodeModules = [], includedFiles = [], includedFilesBasePath } = config
  const { exclude: excludedPaths, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const dependencyPaths = await getSrcFilesForDependencies({
    dependencies: externalNodeModules,
    basedir: srcDir,
    pluginsModulesPath,
  })
  const includedPaths = filterExcludedPaths([...dependencyPaths, ...includedFilePaths], excludedPaths)

  return [...includedPaths, mainFile]
}

const getSrcFilesForDependencies = async function ({
  dependencies: dependencyNames,
  basedir,
  state = getNewCache(),
  pluginsModulesPath,
}: {
  dependencies: string[]
  basedir: string
  state?: TraversalCache
  pluginsModulesPath?: string
}) {
  if (dependencyNames.length === 0) {
    return []
  }

  const packageJson = await getPackageJson(basedir)
  const dependencies = await Promise.all(
    dependencyNames.map((dependencyName) =>
      getSrcFilesForDependency({
        dependency: dependencyName,
        basedir,
        state,
        packageJson,
        pluginsModulesPath,
      }),
    ),
  )
  const paths = new Set(dependencies.flat())

  return [...paths]
}

const getSrcFilesForDependency = async function ({
  dependency,
  basedir,
  state = getNewCache(),
  packageJson,
  pluginsModulesPath,
}: {
  dependency: string
  basedir: string
  state: TraversalCache
  packageJson: PackageJson
  pluginsModulesPath?: string
}) {
  try {
    const paths = await getDependencyPathsForDependency({ dependency, basedir, state, packageJson, pluginsModulesPath })

    return paths
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      return []
    }

    throw error
  }
}

export { getSrcFiles }
