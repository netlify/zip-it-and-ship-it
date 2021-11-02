import { resolve } from 'path'

import { NodeFileTraceReasons } from '@vercel/nft'

import { cachedReadFile, FsCache } from '../../../../utils/fs'
import { PackageJson } from '../../utils/package_json'

const getESMPackageJsons = (esmPaths: Set<string>, reasons: NodeFileTraceReasons, basePath?: string) => {
  const packageJsons: string[] = [...reasons.entries()]
    .filter(([, reason]) => {
      if (reason.type !== 'resolve') {
        return false
      }

      const hasESMParent = [...reason.parents].some((parentPath) => esmPaths.has(parentPath))

      return hasESMParent
    })
    .map(([path]) => (basePath ? resolve(basePath, path) : resolve(path)))

  return packageJsons
}

const getPatchedESMPackages = async (
  esmPaths: Set<string>,
  reasons: NodeFileTraceReasons,
  fsCache: FsCache,
  basePath?: string,
) => {
  const packages = getESMPackageJsons(esmPaths, reasons, basePath)
  const patchedPackages = await Promise.all(packages.map((path) => patchESMPackage(path, fsCache)))
  const patchedPackagesMap = new Map()

  packages.forEach((packagePath, index) => {
    patchedPackagesMap.set(packagePath, patchedPackages[index])
  })

  return patchedPackagesMap
}

const patchESMPackage = async (path: string, fsCache: FsCache) => {
  const file = (await cachedReadFile(fsCache, path, 'utf8')) as string
  const packageJson: PackageJson = JSON.parse(file)
  const patchedPackageJson = {
    ...packageJson,
    type: 'commonjs',
  }

  return JSON.stringify(patchedPackageJson)
}

export { getPatchedESMPackages }
