const { dirname, basename, normalize } = require('path')
const { promisify } = require('util')

const glob = require('glob')
const { not: notJunk } = require('junk')
const pkgDir = require('pkg-dir')
const precinct = require('precinct')
const requirePackageName = require('require-package-name')

const { resolvePathPreserveSymlinks, resolvePackage } = require('./resolve')

const pGlob = promisify(glob)

// Retrieve the paths to the Node.js files to zip.
// We only include the files actually needed by the function because AWS Lambda
// has a size limit for the zipped file. It also makes cold starts faster.
const listNodeFiles = async function(srcPath, mainFile, srcDir, stat) {
  const [treeFiles, depFiles] = await Promise.all([getTreeFiles(srcPath, stat), getDependencies(mainFile, srcDir)])
  const files = [...treeFiles, ...depFiles].map(normalize)
  const uniqueFiles = [...new Set(files)]

  // We sort so that the archive's checksum is deterministic.
  const filteredFiles = uniqueFiles.filter(isNotJunk).sort()
  return filteredFiles
}

// When using a directory, we include all its descendants except `node_modules`
const getTreeFiles = function(srcPath, stat) {
  if (!stat.isDirectory()) {
    return [srcPath]
  }

  return pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true
  })
}

// Remove temporary files like *~, *.swp, etc.
const isNotJunk = function(file) {
  return notJunk(basename(file))
}

// Retrieve all the files recursively required by a Node.js file
const getDependencies = async function(mainFile, srcDir) {
  const packageRoot = await pkgDir(srcDir)
  const packageJson = getPackageJson(packageRoot)

  const state = { localFiles: new Set(), modulePaths: new Set() }

  try {
    return await getFileDependencies({ path: mainFile, packageJson, state })
  } catch (error) {
    error.message = `In file "${mainFile}"\n${error.message}`
    throw error
  }
}

const getPackageJson = function(packageRoot) {
  if (packageRoot === undefined) {
    return {}
  }

  const packageJsonPath = `${packageRoot}/package.json`
  try {
    return require(packageJsonPath)
  } catch (error) {
    throw new Error(`${packageJsonPath} is invalid JSON: ${error.message}`)
  }
}

const getFileDependencies = async function({ path, packageJson, state, treeShakingModule }) {
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
    dependencies.map(dependency =>
      getImportDependencies({ dependency, basedir, packageJson, state, treeShakingModule })
    )
  )
  return [].concat(...depsPaths)
}

const isTreeShakingModule = function({ dependency, treeShakingModule }) {
  return treeShakingModule === getModuleName(dependency)
}

const getImportDependencies = function({ dependency, basedir, packageJson, state, treeShakingModule }) {
  if (LOCAL_IMPORT_REGEXP.test(dependency) || isTreeShakingModule({ dependency, treeShakingModule })) {
    return getTreeShakedDependencies({ dependency, basedir, packageJson, state, treeShakingModule })
  }

  if (isTreeShakable(dependency)) {
    const module = getModuleName(dependency)
    return getTreeShakedDependencies({ dependency, basedir, packageJson, state, treeShakingModule: module })
  }

  return getAllDependencies({ dependency, basedir, state, packageJson })
}

const LOCAL_IMPORT_REGEXP = /^(\.|\/)/

const isTreeShakable = function(dependency) {
  return TREE_SHAKABLE_DEPENDENCIES.has(dependency)
}

const TREE_SHAKABLE_DEPENDENCIES = new Set([
  'next/dist/next-server/lib/constants',
  'next/dist/next-server/lib/constants.js',
  'next/dist/next-server/lib/document-context.js',
  'next/dist/next-server/lib/head.js',
  'next/dist/next-server/lib/i18n/normalize-locale-path',
  'next/dist/next-server/lib/router/utils/get-route-from-asset-path',
  'next/dist/next-server/lib/router/utils/path-match',
  'next/dist/next-server/lib/router/utils/prepare-destination',
  'next/dist/next-server/lib/utils',
  'next/dist/next-server/lib/utils.js',
  'next/dist/next-server/server/api-utils',
  'next/dist/next-server/server/denormalize-page-path',
  'next/dist/next-server/server/get-page-files.js',
  'next/dist/next-server/server/node-polyfill-fetch',
  'next/dist/next-server/server/render',
  'next/dist/next-server/server/send-payload',
  'next/dist/next-server/server/utils.js'
])

// When a file requires another one, we apply the top-level logic recursively
const getTreeShakedDependencies = async function({ dependency, basedir, packageJson, state, treeShakingModule }) {
  const path = await resolvePathPreserveSymlinks(dependency, basedir)
  const depsPath = await getFileDependencies({ path, packageJson, state, treeShakingModule })
  return [path, ...depsPath]
}

// When a file requires a module, we find its path inside `node_modules` and
// use all its published files. We also recurse on the module's dependencies.
const getAllDependencies = async function({ dependency, basedir, state, packageJson }) {
  const moduleName = getModuleName(dependency)

  // Happens when doing require("@scope") (not "@scope/name") or other oddities
  // Ignore those.
  if (moduleName === null) {
    return []
  }

  try {
    return await getModuleNameDependencies(moduleName, basedir, state)
  } catch (error) {
    return handleModuleNotFound({ error, moduleName, packageJson })
  }
}

// When doing require("moduleName/file/path"), only keep `moduleName`
const getModuleName = function(dependency) {
  const dependencyA = dependency.replace(BACKSLASH_REGEXP, '/')
  const moduleName = requirePackageName(dependencyA)
  return moduleName
}

// Windows path normalization
const BACKSLASH_REGEXP = /\\/g

const getModuleNameDependencies = async function(moduleName, basedir, state) {
  if (isExcludedModule(moduleName)) {
    return []
  }

  // Find the Node.js module directory path
  const packagePath = await resolvePackage(moduleName, basedir)

  if (packagePath === undefined) {
    return []
  }

  const modulePath = dirname(packagePath)

  if (state.modulePaths.has(modulePath)) {
    return []
  }

  state.modulePaths.add(modulePath)

  const packageJson = require(packagePath)

  const [publishedFiles, sideFiles, depsPaths] = await Promise.all([
    getPublishedFiles(modulePath),
    getSideFiles(modulePath, moduleName),
    getNestedModules(modulePath, state, packageJson)
  ])
  return [...publishedFiles, ...sideFiles, ...depsPaths]
}

const isExcludedModule = function(moduleName) {
  return EXCLUDED_MODULES.includes(moduleName) || moduleName.startsWith('@types/')
}
const EXCLUDED_MODULES = ['aws-sdk']

// Some modules generate source files on `postinstall` that are not located
// inside the module's directory itself.
const getSideFiles = function(modulePath, moduleName) {
  const sideFiles = SIDE_FILES[moduleName]
  if (sideFiles === undefined) {
    return []
  }

  return getPublishedFiles(`${modulePath}/${sideFiles}`)
}

const SIDE_FILES = {
  '@prisma/client': '../../.prisma'
}

// We use all the files published by the Node.js except some that are not needed
const getPublishedFiles = async function(modulePath) {
  const ignore = getIgnoredFiles(modulePath)
  const publishedFiles = await pGlob(`${modulePath}/**`, {
    ignore,
    nodir: true,
    absolute: true,
    dot: true
  })
  return publishedFiles
}

const getIgnoredFiles = function(modulePath) {
  return IGNORED_FILES.map(ignoreFile => `${modulePath}/${ignoreFile}`)
}

// To make the zip archive smaller, we remove those.
const IGNORED_FILES = [
  'node_modules/**',
  '.npmignore',
  'package-lock.json',
  'yarn.lock',
  '*.log',
  '*.lock',
  '*~',
  '*.map',
  '*.ts',
  '*.patch'
]

// Apply the Node.js module logic recursively on its own dependencies, using
// the `package.json` `dependencies`, `peerDependencies` and
// `optionalDependencies` keys
const getNestedModules = async function(modulePath, state, packageJson) {
  const dependencies = getNestedDependencies(packageJson)

  const depsPaths = await Promise.all(
    dependencies.map(dependency => getAllDependencies({ dependency, basedir: modulePath, state, packageJson }))
  )
  return [].concat(...depsPaths)
}

const getNestedDependencies = function({ dependencies = {}, peerDependencies = {}, optionalDependencies = {} }) {
  return [
    ...Object.keys(dependencies),
    ...Object.keys(peerDependencies).filter(shouldIncludePeerDependency),
    ...Object.keys(optionalDependencies)
  ]
}

// Workaround for https://github.com/netlify/zip-it-and-ship-it/issues/73
// TODO: remove this after adding proper modules exclusion as outlined in
// https://github.com/netlify/zip-it-and-ship-it/issues/68
const shouldIncludePeerDependency = function(name) {
  return !EXCLUDED_PEER_DEPENDENCIES.includes(name)
}

const EXCLUDED_PEER_DEPENDENCIES = ['@prisma/cli', 'prisma2']

// Modules can be required conditionally (inside an `if` or `try`/`catch` block).
// When a `require()` statement is found but the module is not found, it is
// possible that that block either always evaluates to:
//  - `false`: in which case, we should not bundle the dependency
//  - `true`: in which case, we should report the dependency as missing
// Those conditional modules might be:
//  - present in the `package.json` `dependencies`
//  - present in the `package.json` `optionalDependencies`
//  - present in the `package.json` `peerDependencies`
//  - not present in the `package.json`, if the module author wants its users
//    to explicitly install it as an optional dependency.
// The current implementation:
//  - when parsing `require()` statements inside function files, always consider
//    conditional modules to be included, i.e. report them if not found.
//    This is because our current parsing logic does not know whether a
//    `require()` is conditional or not.
//  - when parsing module dependencies, ignore `require()` statements if not
//    present in the `package.json` `*dependencies`. I.e. user must manually
//    install them if the module is used.
// `optionalDependencies`:
//  - are not reported when missing
//  - are included in module dependencies
const handleModuleNotFound = function({ error, moduleName, packageJson }) {
  if (error.code === 'MODULE_NOT_FOUND' && isOptionalModule(moduleName, packageJson)) {
    return []
  }

  throw error
}

const isOptionalModule = function(
  moduleName,
  { optionalDependencies = {}, peerDependenciesMeta = {}, peerDependencies = {} }
) {
  return (
    optionalDependencies[moduleName] !== undefined ||
    (peerDependenciesMeta[moduleName] &&
      peerDependenciesMeta[moduleName].optional &&
      peerDependencies[moduleName] !== undefined)
  )
}

module.exports = { listNodeFiles }
