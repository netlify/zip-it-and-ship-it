const { dirname } = require('path')

const findUp = require('find-up')
const readPackageJson = require('read-package-json-fast')

const getModulesWithDynamicImports = async (warnings) => {
  const dynamicImportWarnings = warnings
    // Unfortunately, esbuild doesn't give us any error codes, so this is the
    // only way we have to single out this case.
    .filter(({ text }) => text.includes('will not be bundled because the argument is not a string literal'))
    .map(async ({ location }) => {
      try {
        const directory = dirname(location.file)
        const packageJsonPath = await findUp('package.json', { cwd: directory })
        const { name } = await readPackageJson(packageJsonPath)

        return name
      } catch (_) {
        // We couldn't find a `package.json` or we couldn't get a package name
        // from it. Either way, it's a no-op.
      }
    })
  const packageNames = await Promise.all(dynamicImportWarnings)

  return [...new Set(packageNames.filter(Boolean))]
}

module.exports = { getModulesWithDynamicImports }
