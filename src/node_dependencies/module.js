const requirePackageName = require('require-package-name')

// Windows path normalization
const BACKSLASH_REGEXP = /\\/g

// When doing require("moduleName/file/path"), only keep `moduleName`
const getModuleName = function (dependency) {
  const dependencyA = dependency.replace(BACKSLASH_REGEXP, '/')
  const moduleName = requirePackageName(dependencyA)
  return moduleName
}

module.exports = { getModuleName }
