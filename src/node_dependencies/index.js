const { dirname, basename, normalize } = require('path')

const findUp = require('find-up')
const { not: notJunk } = require('junk')
const precinct = require('precinct')

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
const listFilesUsingLegacyBundler = async function ({ srcPath, mainFile, srcDir, stat, pluginsModulesPath }) {
  const [treeFiles, depFiles] = await Promise.all([
    getTreeFiles(srcPath, stat),
    getDependencies(mainFile, srcDir, pluginsModulesPath),
  ])
  const files = [...treeFiles, ...depFiles].map(normalize)
  const uniqueFiles = [...new Set(files)]

  // We sort so that the archive's checksum is deterministic.
  // Mutating is fine since `Array.filter()` returns a shallow copy
  // eslint-disable-next-line fp/no-mutating-methods
  const filteredFiles = uniqueFiles.filter(isNotJunk).sort()
  return filteredFiles
}

// Remove temporary files like *~, *.swp, etc.
const isNotJunk = function (file) {
  return notJunk(basename(file))
}

// Retrieve all the files recursively required by a Node.js file
const getDependencies = async function (mainFile, srcDir, pluginsModulesPath) {
  const packageJson = await getPackageJson(srcDir)
  const state = getNewCache()

  try {
    return await getFileDependencies({ path: mainFile, packageJson, state, pluginsModulesPath })
  } catch (error) {
    error.message = `In file "${mainFile}"\n${error.message}`
    throw error
  }
}

const getFileDependencies = async function ({ path, packageJson, pluginsModulesPath, state, treeShakeNext }) {
  if (state.localFiles.has(path)) {
    return []
  }

  state.localFiles.add(path)

  const basedir = dirname(path)
  // This parses JavaScript in `path` to retrieve all the `require()` statements
  // TODO: `precinct.paperwork()` uses `fs.readFileSync()` under the hood,
  // but should use `fs.readFile()` instead
  const dependencies = precinct.paperwork(path, { includeCore: false })
  const depsPaths = await Promise.all(
    dependencies
      .filter(Boolean)
      .map((dependency) =>
        getImportDependencies({ dependency, basedir, packageJson, state, treeShakeNext, pluginsModulesPath }),
      ),
  )
  // TODO: switch to Array.flat() once we drop support for Node.js < 11.0.0
  // eslint-disable-next-line unicorn/prefer-spread
  return [].concat(...depsPaths)
}

const getImportDependencies = function ({
  dependency,
  basedir,
  packageJson,
  state,
  treeShakeNext,
  pluginsModulesPath,
}) {
  const shouldTreeShakeNext = treeShakeNext || isNextOnNetlify(dependency)
  if (shouldTreeShake(dependency, shouldTreeShakeNext)) {
    return getTreeShakedDependencies({
      dependency,
      basedir,
      packageJson,
      state,
      treeShakeNext: shouldTreeShakeNext,
      pluginsModulesPath,
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
  packageJson,
  state,
  treeShakeNext,
  pluginsModulesPath,
}) {
  const path = await resolvePathPreserveSymlinks(dependency, [basedir, pluginsModulesPath].filter(Boolean))
  const depsPath = await getFileDependencies({ path, packageJson, state, treeShakeNext, pluginsModulesPath })
  return [path, ...depsPath]
}

module.exports = {
  getDependencyPathsForDependency,
  getDependencyNamesAndPathsForDependencies,
  getDependencyNamesAndPathsForDependency,
  getExternalAndIgnoredModulesFromSpecialCases,
  getPluginsModulesPath,
  listFilesUsingLegacyBundler,
}
