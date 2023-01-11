import requirePackageName from 'require-package-name'
import unixify from 'unixify'

// When doing require("moduleName/file/path"), only keep `moduleName`
export const getModuleName = function (dependency: string): string {
  // Windows path normalization
  const dependencyA = unixify(dependency)
  const moduleName = requirePackageName(dependencyA)

  return moduleName
}
