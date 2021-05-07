const { dirname } = require('path')

const findUp = require('find-up')
const readPackageJson = require('read-package-json-fast')

const getModulesWithDynamicImports = async (warnings) => {
  const dynamicImportWarnings = warnings
    // Unfortunately, esbuild doesn't give us any error codes, so this is the
    // only way we have to single out this case.
    .filter(({ text }) => text.includes('will not be bundled because the argument is not a string literal'))
    .map(async ({ location }) => {
      const directory = dirname(location.file)

      try {
        const packageJsonPath = await findUp('package.json', { cwd: directory })
        const { name } = await readPackageJson(packageJsonPath)

        return name
      } catch (_) {
        // no-op
      }
    })
  const packageNames = await Promise.all(dynamicImportWarnings)

  return [...new Set(packageNames.filter(Boolean))]
}

module.exports = { getModulesWithDynamicImports }
