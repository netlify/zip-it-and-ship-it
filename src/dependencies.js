const { dirname } = require('path')

const precinct = require('precinct')
const resolve = require('resolve')
const requirePackageName = require('require-package-name')
const promisify = require('util.promisify')
const glob = require('glob')
const debug = require('debug')('@netlify/zip-it-and-ship-it:finders')

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

const LOCAL_IMPORT_REGEXP = /^\.|\//

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
  return pGlob(`${modulePath}/**`, {
    ignore,
    nodir: true,
    absolute: true,
    dot: true
  })
}

const getIgnoredFiles = function(modulePath, files) {
  const patterns = files === undefined ? [...IGNORED_FILES, ...IGNORED_EXTENSIONS] : IGNORED_FILES
  return patterns.map(ignoreFile => `${modulePath}/${ignoreFile}`)
}

const IGNORED_FILES = ['node_modules/**', '.npmignore', 'package-lock.json', 'yarn.lock']

// To make the zip archive smaller, we remove those. However we don't do this
// if the Node.js module `package.json` `files` property is defined, since this
// means the files might be published for a good reason.
const IGNORED_EXTENSIONS = [
  '*.log',
  '*.lock',
  '*.html',
  '*.md',
  '*.map',
  '*.ts',
  '*.png',
  '*.jpeg',
  '*.jpg',
  '*.gif',
  '*.css',
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
  const deps = [dependencies, peerDependencies, optionalDependencies].map(Object.keys)
  return [].concat(...deps)
}

const handleModuleNotFound = function(error, moduleName, optionalDependencies) {
  if (isOptionalModule(error, moduleName, optionalDependencies)) {
    debug(`WARNING missing optional dependency: ${moduleName}`)
    return []
  }

  throw error
}

const isOptionalModule = function(error, moduleName, optionalDependencies = {}) {
  return (
    error.code === 'MODULE_NOT_FOUND' &&
    (optionalDependencies[moduleName] !== undefined || EXCLUDED_OPTIONAL_MODULES.includes(moduleName))
  )
}

// `node-fetch@<3` conditionally requires the `encoding` module, but do not
// declare it as an optionalDependency
const EXCLUDED_OPTIONAL_MODULES = ['encoding']

module.exports = { getDependencies }
