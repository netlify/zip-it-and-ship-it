import { basename, dirname, extname, resolve } from 'path'

import { NodeFileTraceReasons } from '@vercel/nft'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import { cachedReadFile, FsCache } from '../../../../utils/fs.js'
import { ModuleFileExtension, ModuleFormat } from '../../utils/module_format.js'
import { getNodeSupportMatrix } from '../../utils/node_version.js'
import { getPackageJsonIfAvailable, PackageJson } from '../../utils/package_json.js'

import { transpile } from './transpile.js'

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

export const processESM = async ({
  basePath,
  config,
  esmPaths,
  featureFlags,
  fsCache,
  mainFile,
  reasons,
  name,
}: {
  basePath: string | undefined
  config: FunctionConfig
  esmPaths: Set<string>
  featureFlags: FeatureFlags
  fsCache: FsCache
  mainFile: string
  reasons: NodeFileTraceReasons
  name: string
}): Promise<{ rewrites?: Map<string, string>; moduleFormat: ModuleFormat }> => {
  const extension = extname(mainFile)

  // If this is a .mjs file and we want to output pure ESM files, we don't need
  // to transpile anything.
  if (extension === ModuleFileExtension.MJS && featureFlags.zisi_pure_esm_mjs) {
    return {
      moduleFormat: ModuleFormat.ESM,
    }
  }

  const entrypointIsESM = isEntrypointESM({ basePath, esmPaths, mainFile })

  if (!entrypointIsESM) {
    return {
      moduleFormat: ModuleFormat.COMMONJS,
    }
  }

  const packageJson = await getPackageJsonIfAvailable(dirname(mainFile))
  const nodeSupport = getNodeSupportMatrix(config.nodeVersion)

  if (featureFlags.zisi_pure_esm && packageJson.type === 'module' && nodeSupport.esm) {
    return {
      moduleFormat: ModuleFormat.ESM,
    }
  }

  const rewrites = await transpileESM({ basePath, config, esmPaths, fsCache, reasons, name })

  return {
    moduleFormat: ModuleFormat.COMMONJS,
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
  const parentPaths = [...parents].filter((parentPath) => parentPath !== path)

  // If the path is an entrypoint, we transpile it only if it's an ESM file.
  if (parentPaths.length === 0) {
    const isESM = esmPaths.has(path)

    cache.set(path, isESM)

    return isESM
  }

  // The path should be transpiled if every parent will also be transpiled, or
  // if there is no parent.
  const shouldTranspilePath = parentPaths.every((parentPath) => shouldTranspile(parentPath, cache, esmPaths, reasons))

  cache.set(path, shouldTranspilePath)

  return shouldTranspilePath
}

const transpileESM = async ({
  basePath,
  config,
  esmPaths,
  fsCache,
  reasons,
  name,
}: {
  basePath: string | undefined
  config: FunctionConfig
  esmPaths: Set<string>
  fsCache: FsCache
  reasons: NodeFileTraceReasons
  name: string
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
      const transpiled = await transpile(absolutePath, config, name)

      rewrites.set(absolutePath, transpiled)
    }),
  )

  return rewrites
}
