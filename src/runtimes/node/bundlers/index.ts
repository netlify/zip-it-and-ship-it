import { extname } from 'path'

import { FunctionConfig } from '../../../config.js'
import { FeatureFlags } from '../../../feature_flags.js'
import { detectEsModule } from '../utils/detect_es_module.js'
import { ModuleFileExtension } from '../utils/module_format.js'

import esbuildBundler from './esbuild/index.js'
import nftBundler from './nft/index.js'
import noBundler from './none/index.js'
import { NodeBundler, NodeBundlerType } from './types.js'
import zisiBundler from './zisi/index.js'

export const getBundler = (name: NodeBundlerType): NodeBundler => {
  switch (name) {
    case NodeBundlerType.ESBUILD:
    case NodeBundlerType.ESBUILD_ZISI:
      return esbuildBundler

    case NodeBundlerType.NFT:
      return nftBundler

    case NodeBundlerType.ZISI:
      return zisiBundler

    case NodeBundlerType.NONE:
      return noBundler

    default:
      throw new Error(`Unsupported Node bundler: ${name}`)
  }
}

export const getBundlerName = async ({
  config: { nodeBundler },
  extension,
  featureFlags,
  mainFile,
}: {
  config: FunctionConfig
  extension: string
  featureFlags: FeatureFlags
  mainFile: string
}): Promise<NodeBundlerType> => {
  if (nodeBundler) {
    return nodeBundler
  }

  return await getDefaultBundler({ extension, featureFlags, mainFile })
}

const ESBUILD_EXTENSIONS = new Set(['.mjs', '.ts', '.tsx', '.cts', '.mts'])

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
const getDefaultBundler = async ({
  extension,
  featureFlags,
  mainFile,
}: {
  extension: string
  mainFile: string
  featureFlags: FeatureFlags
}): Promise<NodeBundlerType> => {
  if (extension === ModuleFileExtension.MJS && featureFlags.zisi_pure_esm_mjs) {
    return NodeBundlerType.NFT
  }

  if (ESBUILD_EXTENSIONS.has(extension)) {
    return NodeBundlerType.ESBUILD
  }

  if (featureFlags.traceWithNft) {
    return NodeBundlerType.NFT
  }

  const functionIsESM = extname(mainFile) !== ModuleFileExtension.CJS && (await detectEsModule({ mainFile }))

  return functionIsESM ? NodeBundlerType.NFT : NodeBundlerType.ZISI
}
