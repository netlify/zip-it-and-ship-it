import { basename, dirname, resolve } from 'path'

import { NodeFileTraceReasons } from '@vercel/nft'

import type { FunctionConfig } from '../../../../config'
import { FeatureFlags } from '../../../../feature_flags'
import { cachedReadFile, FsCache } from '../../../../utils/fs'
import { ModuleFormat } from '../../utils/module_format'
import { getNodeSupportMatrix } from '../../utils/node_version'
import { getPackageJson, PackageJson } from '../../utils/package_json'

import { transpile } from './transpile'

const getPatchedESMPackages = async (packages: string[], fsCache: FsCache) => {
  const patchedPackages = await Promise.all(packages.map((path) => patchESMPackage(path, fsCache)))
  const patchedPackagesMap = new Map<string, string>()

  packages.forEach((packagePath, index) => {
    patchedPackagesMap.set(packagePath, patchedPackages[index])
  })

  return patchedPackagesMap
}

const isEntrypointESM = ({
  basePath,
  esmPaths,
  mainFile,
}: {
  basePath?: string
  esmPaths: Set<string>
  mainFile: string
}) => {
  const absoluteESMPaths = new Set([...esmPaths].map((path) => resolvePath(path, basePath)))
  const entrypointIsESM = absoluteESMPaths.has(mainFile)

  return entrypointIsESM
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

const processESM = async ({
  basePath,
  config,
  esmPaths,
  featureFlags,
  fsCache,
  mainFile,
  reasons,
}: {
  basePath: string | undefined
  config: FunctionConfig
  esmPaths: Set<string>
  featureFlags: FeatureFlags
  fsCache: FsCache
  mainFile: string
  reasons: NodeFileTraceReasons
}): Promise<{ rewrites?: Map<string, string>; moduleFormat: ModuleFormat }> => {
  const entrypointIsESM = isEntrypointESM({ basePath, esmPaths, mainFile })

  if (!entrypointIsESM) {
    return {
      moduleFormat: 'cjs',
    }
  }

  const packageJson = await getPackageJson(dirname(mainFile))
  const nodeSupport = getNodeSupportMatrix(config.nodeVersion)

  if (featureFlags.zisi_pure_esm && packageJson.type === 'module' && nodeSupport.esm) {
    return {
      moduleFormat: 'esm',
    }
  }

  const rewrites = await transpileESM({ basePath, config, esmPaths, fsCache, reasons })

  return {
    moduleFormat: 'cjs',
    rewrites,
  }
}

const resolvePath = (relativePath: string, basePath?: string) =>
  basePath ? resolve(basePath, relativePath) : resolve(relativePath)

const shouldTranspile = (
  path: string,
  cache: Map<string, boolean>,
  esmPaths: Set<string>,
  reasons: NodeFileTraceReasons,
): boolean => {
  if (cache.has(path)) {
    return cache.get(path) as boolean
  }

  const reason = reasons.get(path)

  // This isn't an expected case, but if the path doesn't exist in `reasons` we
  // don't transpile it.
  if (reason === undefined) {
    cache.set(path, false)

    return false
  }

  const { parents } = reason

  // If the path is an entrypoint, we transpile it only if it's an ESM file.
  if (parents.size === 0) {
    const isESM = esmPaths.has(path)

    cache.set(path, isESM)

    return isESM
  }

  // The path should be transpiled if every parent will also be transpiled, or
  // if there is no parent.
  const shouldTranspilePath = [...parents].every((parentPath) => shouldTranspile(parentPath, cache, esmPaths, reasons))

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
  const pathsToTranspile = [...esmPaths].filter((path) => shouldTranspile(path, cache, esmPaths, reasons))
  const pathsToTranspileSet = new Set(pathsToTranspile)
  const packageJsonPaths: string[] = [...reasons.entries()]
    .filter(([path, reason]) => {
      if (basename(path) !== 'package.json') {
        return false
      }

      const needsPatch = [...reason.parents].some((parentPath) => pathsToTranspileSet.has(parentPath))

      return needsPatch
    })
    .map(([path]) => (basePath ? resolve(basePath, path) : resolve(path)))
  const rewrites = await getPatchedESMPackages(packageJsonPaths, fsCache)

  await Promise.all(
    pathsToTranspile.map(async (path) => {
      const absolutePath = resolvePath(path, basePath)
      const transpiled = await transpile(absolutePath, config)

      rewrites.set(absolutePath, transpiled)
    }),
  )

  return rewrites
}

export { processESM }
