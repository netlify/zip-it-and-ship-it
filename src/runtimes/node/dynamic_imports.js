const { basename, join } = require('path')

const findUp = require('find-up')
const readPackageJson = require('read-package-json-fast')

const getDynamicImportsPlugin = ({ moduleNames, srcDir }) => ({
  name: 'dynamic-imports',
  setup(build) {
    const cache = new Map()

    build.onDynamicImport({}, async (args) => {
      try {
        const packageName = await getPackageNameCached({ cache, resolveDirectory: args.resolveDir, srcDir })

        if (packageName !== undefined) {
          moduleNames.add(packageName)
        }
      } catch (_) {
        // no-op
      }
    })
  },
})

const getPackageName = async ({ resolveDirectory, srcDir }) => {
  const packageJsonPath = await findUp(
    async (directory) => {
      // We stop traversing if we're about to leave the boundaries of the
      // function directory or any node_modules directory.
      if (directory === srcDir || basename(directory) === 'node_modules') {
        return findUp.stop
      }

      const path = join(directory, 'package.json')
      const hasPackageJson = await findUp.exists(path)

      return hasPackageJson ? path : false
    },
    { cwd: resolveDirectory },
  )

  if (packageJsonPath !== undefined) {
    const { name } = await readPackageJson(packageJsonPath)

    return name
  }
}

const getPackageNameCached = ({ cache, resolveDirectory, srcDir }) => {
  if (!cache.has(resolveDirectory)) {
    cache.set(resolveDirectory, getPackageName({ resolveDirectory, srcDir }))
  }

  return cache.get(resolveDirectory)
}

module.exports = { getDynamicImportsPlugin }
