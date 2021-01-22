const { version: nodeVersion } = require('process')

const findUp = require('find-up')
const pathExists = require('path-exists')
const resolveLib = require('resolve')
const { lt: ltVersion } = require('semver')

// Find the path to a module's `package.json`
// We need to use `resolve` instead of `require.resolve()` because:
//  - it is async
//  - it preserves symlinks:
//     - this is important because if a file does a `require('./symlink')`, we
//       need to bundle the symlink and its target, not only the target
//     - `path.resolve()` cannot be used for relative|absolute file paths
//       because it does not resolve ommitted file extension,
//       e.g. `require('./file')` instead of `require('./file.js')`
//     - the CLI flag `--preserve-symlinks` can be used with Node.js, but it
//       cannot be set runtime
// However it does not give helpful error messages.
//   https://github.com/browserify/resolve/issues/223
// So, on errors, we fallback to `require.resolve()`
const resolvePackage = async function (moduleName, baseDirs) {
  try {
    return await resolvePathPreserveSymlinks(`${moduleName}/package.json`, baseDirs)
  } catch (error) {
    if (ltVersion(nodeVersion, REQUEST_RESOLVE_MIN_VERSION)) {
      throw error
    }

    try {
      return resolvePathFollowSymlinks(`${moduleName}/package.json`, baseDirs)
    } catch (error_) {
      return await resolvePackageFallback(moduleName, baseDirs, error_)
    }
  }
}

// TODO: remove after dropping support for Node <8.9.0
// `require.resolve()` option `paths` was introduced in Node 8.9.0
const REQUEST_RESOLVE_MIN_VERSION = '8.9.0'

// We need to use `new Promise()` due to a bug with `utils.promisify()` on
// `resolve`:
//   https://github.com/browserify/resolve/issues/151#issuecomment-368210310
const resolvePathPreserveSymlinksForDir = function (path, basedir) {
  return new Promise((resolve, reject) => {
    resolveLib(path, { basedir, preserveSymlinks: true }, (error, resolvedLocation) => {
      if (error) {
        return reject(error)
      }

      resolve(resolvedLocation)
    })
  })
}

// the resolve library has a `paths` option but it's not the same as multiple basedirs
// see https://github.com/browserify/resolve/issues/188#issuecomment-679010477
// we return the first resolved location or the first error if all failed
const resolvePathPreserveSymlinks = async function (path, baseDirs) {
  // eslint-disable-next-line fp/no-let
  let firstError
  // eslint-disable-next-line fp/no-loops
  for (const basedir of baseDirs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await resolvePathPreserveSymlinksForDir(path, basedir)
    } catch (error) {
      // eslint-disable-next-line fp/no-mutation
      firstError = firstError || error
    }
  }

  throw firstError
}

const resolvePathFollowSymlinks = function (path, baseDirs) {
  return require.resolve(path, { paths: baseDirs })
}

// `require.resolve()` on a module's specific file (like `package.json`)
// can be forbidden by the package author by using an `exports` field in
// their `package.json`. We need this fallback.
// It looks for the first directory up from a package's `main` file that:
//   - is named like the package
//   - has a `package.json`
// Theoretically, this might not the root `package.json`, but this is very
// unlikely, and we don't have any better alternative.
const resolvePackageFallback = async function (moduleName, baseDirs, error) {
  const mainFilePath = resolvePathFollowSymlinks(moduleName, baseDirs)
  const packagePath = await findUp(isPackageDir.bind(null, moduleName), { cwd: mainFilePath, type: 'directory' })
  if (packagePath === undefined) {
    throw error
  }
  return packagePath
}

const isPackageDir = async function (moduleName, dir) {
  // Need to use `endsWith()` to take into account `@scope/package`.
  // Backslashes need to be converted for Windows.
  if (!dir.replace(BACKSLASH_REGEXP, '/').endsWith(moduleName) || !(await pathExists(`${dir}/package.json`))) {
    return
  }

  return dir
}

const BACKSLASH_REGEXP = /\\/g

module.exports = { resolvePackage, resolvePathPreserveSymlinks }
