const pkgDir = require('pkg-dir')

// Retrieve the `package.json` of a specific project or module
const getPackageJson = async function (srcDir) {
  const packageRoot = await pkgDir(srcDir)

  if (packageRoot === undefined) {
    return {}
  }

  const packageJsonPath = `${packageRoot}/package.json`
  try {
    // The path depends on the user's build, i.e. must be dynamic
    // eslint-disable-next-line import/no-dynamic-require, node/global-require
    return require(packageJsonPath)
  } catch (error) {
    throw new Error(`${packageJsonPath} is invalid JSON: ${error.message}`)
  }
}

module.exports = { getPackageJson }
