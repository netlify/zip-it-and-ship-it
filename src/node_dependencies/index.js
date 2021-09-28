const { dirname, basename, normalize } = require('path')

const findUp = require('find-up')
const { not: notJunk } = require('junk')

const { listImports } = require('../runtimes/node/list_imports')

const { getPackageJson } = require('./package_json')
const { resolvePathPreserveSymlinks } = require('./resolve')
const { getExternalAndIgnoredModulesFromSpecialCases } = require('./special_cases')
const {
  getDependencyPathsForDependency,
  getDependencyNamesAndPathsForDependencies,
  getDependencyNamesAndPathsForDependency,
  getNewCache,
} = require('./traverse')
const { getTreeFiles } = require('./tree_files')
const { shouldTreeShake } = require('./tree_shake')

const AUTO_PLUGINS_DIR = '.netlify/plugins/'

const getPluginsModulesPath = (srcDir) => findUp(`${AUTO_PLUGINS_DIR}node_modules`, { cwd: srcDir, type: 'directory' })

// Retrieve the paths to the Node.js files to zip.
// We only include the files actually needed by the function because AWS Lambda
// has a size limit for the zipped file. It also makes cold starts faster.
const listFilesUsingLegacyBundler = async function ({
  featureFlags,
  srcPath,
  mainFile,
  srcDir,
  stat,
  pluginsModulesPath,
}) {
  const [treeFiles, parsedEntryPoint] = await Promise.all([
    getTreeFiles(srcPath, stat),
    parseEntryPoint(mainFile, srcDir, pluginsModulesPath, featureFlags),
  ])
  const { dependencies, iscDeclarations } = parsedEntryPoint
  const files = [...treeFiles, ...dependencies].map(normalize)
  const uniqueFiles = [...new Set(files)]

  // We sort so that the archive's checksum is deterministic.
  // Mutating is fine since `Array.filter()` returns a shallow copy
  const filteredFiles = uniqueFiles.filter(isNotJunk).sort()

  return { iscDeclarations, paths: filteredFiles }
}

// Remove temporary files like *~, *.swp, etc.
const isNotJunk = function (file) {
  return notJunk(basename(file))
}

// Retrieve all the files recursively required by a Node.js file
const parseEntryPoint = async function (mainFile, srcDir, pluginsModulesPath, featureFlags) {
  const packageJson = await getPackageJson(srcDir)
  const state = getNewCache()

  try {
    return await parseFile({
      featureFlags,
      packageJson,
      path: mainFile,
      pluginsModulesPath,
      state,
    })
  } catch (error) {
    error.message = `In file "${mainFile}"\n${error.message}`
    throw error
  }
}

const parseFile = async function ({ featureFlags, path, packageJson, pluginsModulesPath, state, treeShakeNext }) {
  if (state.localFiles.has(path)) {
    return { dependencies: [] }
  }

  state.localFiles.add(path)

  const basedir = dirname(path)
  const { imports, iscDeclarations } = await listImports({ path })
  const dependencyPaths = await Promise.all(
    imports.filter(Boolean).map((dependency) =>
      getImportDependencies({
        dependency,
        basedir,
        featureFlags,
        packageJson,
        pluginsModulesPath,
        state,
        treeShakeNext,
      }),
    ),
  )

  return { dependencies: dependencyPaths.flat(), iscDeclarations }
}

const getImportDependencies = function ({
  dependency,
  basedir,
  featureFlags,
  packageJson,
  pluginsModulesPath,
  state,
  treeShakeNext,
}) {
  const shouldTreeShakeNext = treeShakeNext || isNextOnNetlify(dependency)
  if (shouldTreeShake(dependency, shouldTreeShakeNext)) {
    return getTreeShakedDependencies({
      dependency,
      basedir,
      featureFlags,
      packageJson,
      pluginsModulesPath,
      state,
      treeShakeNext: shouldTreeShakeNext,
    })
  }

  return getDependencyPathsForDependency({ dependency, basedir, state, packageJson, pluginsModulesPath })
}

const isNextOnNetlify = function (dependency) {
  return basename(dependency, '.js') === 'renderNextPage'
}

// When a file requires another one, we apply the top-level logic recursively
const getTreeShakedDependencies = async function ({
  dependency,
  basedir,
  featureFlags,
  packageJson,
  pluginsModulesPath,
  state,
  treeShakeNext,
}) {
  const path = await resolvePathPreserveSymlinks(dependency, [basedir, pluginsModulesPath].filter(Boolean))
  const { dependencies } = await parseFile({
    featureFlags,
    path,
    packageJson,
    pluginsModulesPath,
    state,
    treeShakeNext,
  })
  return [path, ...dependencies]
}

module.exports = {
  getDependencyPathsForDependency,
  getDependencyNamesAndPathsForDependencies,
  getDependencyNamesAndPathsForDependency,
  getExternalAndIgnoredModulesFromSpecialCases,
  getPluginsModulesPath,
  listFilesUsingLegacyBundler,
}
