import { basename, resolve } from 'path'

import { NodeFileTraceReasons } from '@vercel/nft'

import type { FunctionConfig } from '../../../../config'
import { cachedReadFile, FsCache } from '../../../../utils/fs'
import { PackageJson } from '../../utils/package_json'

import { transpile } from './transpile'

const getPatchedESMPackages = async (packages: string[], fsCache: FsCache) => {
  const patchedPackages = await Promise.all(packages.map((path) => patchESMPackage(path, fsCache)))
  const patchedPackagesMap: Map<string, string> = new Map()

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

const shouldTranspile = (path: string, cache: Map<string, boolean>, reasons: NodeFileTraceReasons) => {
  const reason = reasons.get(path)

  if (reason === undefined) {
    return false
  }

  const { parents } = reason

  // The path should be transpiled if every parent will also be transpiled, or
  // if there is no parent.
  const shouldTranspilePath = [...parents].every((parentPath) => cache.get(parentPath) === true)

  cache.set(path, shouldTranspilePath)

  return shouldTranspilePath
}

const transpileESM = async ({
  basePath,
  config,
  esmPaths,
  fsCache,
  reasons,
}: {
  basePath: string | undefined
  config: FunctionConfig
  esmPaths: Set<string>
  fsCache: FsCache
  reasons: NodeFileTraceReasons
}) => {
  const cache: Map<string, boolean> = new Map()
  const paths = [...esmPaths].filter((path) => shouldTranspile(path, cache, reasons))
  const pathsSet = new Set(paths)
  const packageJsonPaths: string[] = [...reasons.entries()]
    .filter(([path, reason]) => {
      if (basename(path) !== 'package.json') {
        return false
      }

      const needsPatch = [...reason.parents].some((parentPath) => pathsSet.has(parentPath))

      return needsPatch
    })
    .map(([path]) => (basePath ? resolve(basePath, path) : resolve(path)))
  const rewrites = await getPatchedESMPackages(packageJsonPaths, fsCache)

  await Promise.all(
    paths.map(async (path) => {
      const absolutePath = basePath ? resolve(basePath, path) : resolve(path)
      const transpiled = await transpile(absolutePath, config)

      rewrites.set(absolutePath, transpiled)
    }),
  )

  return rewrites
}

export { transpileESM }
