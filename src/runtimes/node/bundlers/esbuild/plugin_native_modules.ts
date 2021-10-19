import path from 'path'

import type { Plugin } from '@netlify/esbuild'
import readPackageJson from 'read-package-json-fast'

import type { NativeNodeModules } from '..'
import { isNativeModule } from '../../utils/detect_native_module'
import { PackageJson } from '../../utils/package_json'

type NativeModuleCacheEntry = [boolean | undefined, PackageJson]
type NativeModuleCache = Record<string, Promise<NativeModuleCacheEntry>>

// Filters out relative or absolute file paths.
const packageFilter = /^([^./]*)$/

// Filters valid package names and extracts the base directory.
const packageName = /^([^@][^/]*|@[^/]*\/[^/]+)(?:\/|$)/

const findNativeModule = (packageJsonPath: string, cache: NativeModuleCache) => {
  if (cache[packageJsonPath] === undefined) {
    // eslint-disable-next-line no-param-reassign, promise/prefer-await-to-then
    cache[packageJsonPath] = readPackageJson(packageJsonPath).then(
      (data) => [Boolean(isNativeModule(data)), data],
      () => [undefined, {}],
    )
  }

  return cache[packageJsonPath]
}

const getNativeModulesPlugin = (externalizedModules: NativeNodeModules): Plugin => ({
  name: 'external-native-modules',
  setup(build) {
    const cache: NativeModuleCache = {}

    // eslint-disable-next-line complexity, max-statements
    build.onResolve({ filter: packageFilter }, async (args) => {
      const pkg = packageName.exec(args.path)

      if (!pkg) return

      let directory = args.resolveDir

      while (true) {
        if (path.basename(directory) !== 'node_modules') {
          const modulePath = path.join(directory, 'node_modules', pkg[1])
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

export { getNativeModulesPlugin }
