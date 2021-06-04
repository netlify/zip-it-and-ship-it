const path = require('path')

const readPackageJson = require('read-package-json-fast')

const { isNativeModule } = require('./detector')

// Filters out relative or absolute file paths.
const packageFilter = /^([^./]*)$/

// Filters valid package names and extracts the base directory.
const packageName = /^([^@][^/]*|@[^/]*\/[^/]+)(?:\/|$)/

const findNativeModule = (packageJsonPath, cache) => {
  if (cache[packageJsonPath] === undefined) {
    // eslint-disable-next-line no-param-reassign, promise/prefer-await-to-then
    cache[packageJsonPath] = readPackageJson(packageJsonPath).then(
      (data) => [Boolean(isNativeModule(data), data), data],
      () => [],
    )
  }

  return cache[packageJsonPath]
}

const getNativeModulesPlugin = (externalizedModules) => ({
  name: 'external-native-modules',
  setup(build) {
    const cache = {}

    // eslint-disable-next-line complexity, max-statements
    build.onResolve({ filter: packageFilter }, async (args) => {
      const package = packageName.exec(args.path)

      if (!package) return

      let directory = args.resolveDir

      while (true) {
        if (path.basename(directory) !== 'node_modules') {
          const modulePath = path.join(directory, 'node_modules', package[1])
          const packageJsonPath = path.join(modulePath, 'package.json')
          // eslint-disable-next-line no-await-in-loop
          const [isNative, packageJsonData] = await findNativeModule(packageJsonPath, cache)

          // eslint-disable-next-line max-depth
          if (isNative === true) {
            // eslint-disable-next-line max-depth
            if (externalizedModules[args.path] === undefined) {
              // eslint-disable-next-line no-param-reassign
              externalizedModules[args.path] = {}
            }

            // eslint-disable-next-line no-param-reassign
            externalizedModules[args.path][modulePath] = packageJsonData.version

            return { path: args.path, external: true }
          }

          // eslint-disable-next-line max-depth
          if (isNative === false) {
            return
          }
        }

        const parentDirectory = path.dirname(directory)

        if (parentDirectory === directory) {
          break
        }

        directory = parentDirectory
      }
    })
  },
})

module.exports = { getNativeModulesPlugin }
