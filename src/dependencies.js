const { dirname } = require('path')

const precinct = require('precinct')
const resolve = require('resolve')
const requirePackageName = require('require-package-name')
const promisify = require('util.promisify')
const glob = require('glob')

const pResolve = promisify(resolve)
const pGlob = promisify(glob)

// Retrieve all the files recursively required by a Node.js file
const getDependencies = async function(handler, packageRoot) {
  const packageJson = getPackageJson(packageRoot)

  const state = { localFiles: [], modulePaths: [] }

  try {
    return await getFileDependencies(handler, packageJson, state)
  } catch (error) {
    error.message = `In file "${handler}": ${error.message}`
    throw error
  }
}

const getPackageJson = function(packageRoot) {
  if (packageRoot === undefined) {
    return {}
  }

  return require(`${packageRoot}/package.json`)
}

const getFileDependencies = async function(path, packageJson, state) {
  if (state.localFiles.includes(path)) {
    return []
  }

  state.localFiles.push(path)

  const basedir = dirname(path)
  // This parses JavaScript in `path` to retrieve all the `require()` statements
  // TODO: `precinct.paperwork()` uses `fs.readFileSync()` under the hood,
  // but should use `fs.readFile()` instead
  const dependencies = precinct.paperwork(path, { includeCore: false })

  const depsPaths = await Promise.all(
    dependencies.map(dependency => getImportDependencies(dependency, basedir, packageJson, state))
  )
  return [].concat(...depsPaths)
}

// `require()` statements can be either `require('moduleName')` or
// `require(path)`
const getImportDependencies = function(dependency, basedir, packageJson, state) {
  if (LOCAL_IMPORT_REGEXP.test(dependency)) {
    return getLocalImportDependencies(dependency, basedir, packageJson, state)
  }

  return getModuleDependencies(dependency, basedir, state, packageJson)
}

const LOCAL_IMPORT_REGEXP = /^(\.|\/)/

// When a file requires another one, we apply the top-level logic recursively
const getLocalImportDependencies = async function(dependency, basedir, packageJson, state) {
  const dependencyPath = await pResolve(dependency, { basedir })
  const depsPath = await getFileDependencies(dependencyPath, packageJson, state)
  return [dependencyPath, ...depsPath]
}

// When a file requires a module, we find its path inside `node_modules` and
// use all its published files. We also recurse on the module's dependencies.
const getModuleDependencies = async function(dependency, basedir, state, { optionalDependencies }) {
  const moduleName = requirePackageName(dependency.replace(BACKSLASH_REGEXP, '/'))

  try {
    return await getModuleNameDependencies(moduleName, basedir, state)
  } catch (error) {
    return handleModuleNotFound(error, moduleName, optionalDependencies)
  }
}

const BACKSLASH_REGEXP = /\\/g

const getModuleNameDependencies = async function(moduleName, basedir, state) {
  if (EXCLUDED_MODULES.includes(moduleName)) {
    return []
  }

  // Find the Node.js module directory path
  const packagePath = await pResolve(`${moduleName}/package.json`, { basedir })
  const modulePath = dirname(packagePath)

  if (state.modulePaths.includes(modulePath)) {
    return []
  }

  state.modulePaths.push(modulePath)

  const pkg = require(packagePath)

  const [publishedFiles, depsPaths] = await Promise.all([
    getPublishedFiles(modulePath, pkg),
    getNestedModules(modulePath, state, pkg)
  ])
  return [...publishedFiles, ...depsPaths]
}

const EXCLUDED_MODULES = ['aws-sdk']

// We use all the files published by the Node.js except some that are not needed
const getPublishedFiles = async function(modulePath, { files }) {
  const ignore = getIgnoredFiles(modulePath, files)
  const publishedFiles = await pGlob(`${modulePath}/**`, {
    ignore,
    nodir: true,
    absolute: true,
    dot: true
  })
  return publishedFiles
}

const getIgnoredFiles = function(modulePath, files) {
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
const getNestedModules = async function(modulePath, state, pkg) {
  const dependencies = getNestedDependencies(pkg)

  const depsPaths = await Promise.all(
    dependencies.map(dependency => getModuleDependencies(dependency, modulePath, state, pkg))
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

const EXCLUDED_PEER_DEPENDENCIES = ['prisma2']

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
const handleModuleNotFound = function(error, moduleName, optionalDependencies = {}) {
  if (error.code === 'MODULE_NOT_FOUND' && optionalDependencies[moduleName] !== undefined) {
    return []
  }

  throw error
}

module.exports = { getDependencies }
