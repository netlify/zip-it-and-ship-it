import { extname } from 'path'

import { FunctionConfig } from '../../../config.js'
import { FeatureFlags } from '../../../feature_flags.js'
import { detectEsModule } from '../utils/detect_es_module.js'
import { MODULE_FILE_EXTENSION } from '../utils/module_format.js'

import esbuildBundler from './esbuild/index.js'
import nftBundler from './nft/index.js'
import noBundler from './none/index.js'
import { NodeBundler, NodeBundlerName, NODE_BUNDLER } from './types.js'
import zisiBundler from './zisi/index.js'

export const getBundler = (name: NodeBundlerName): NodeBundler => {
  switch (name) {
    case NODE_BUNDLER.ESBUILD:
    case NODE_BUNDLER.ESBUILD_ZISI:
      return esbuildBundler

    case NODE_BUNDLER.NFT:
      return nftBundler

    case NODE_BUNDLER.ZISI:
      return zisiBundler

    case NODE_BUNDLER.NONE:
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
  runtimeAPIVersion,
}: {
  config: FunctionConfig
  extension: string
  featureFlags: FeatureFlags
  mainFile: string
  runtimeAPIVersion: number
}): Promise<NodeBundlerName> => {
  if (nodeBundler) {
    return nodeBundler
  }

  return await getDefaultBundler({ extension, featureFlags, mainFile, runtimeAPIVersion })
}

const ESBUILD_EXTENSIONS = new Set(['.mjs', '.ts', '.tsx', '.cts', '.mts'])

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
const getDefaultBundler = async ({
  extension,
  featureFlags,
  mainFile,
  runtimeAPIVersion,
}: {
  extension: string
  mainFile: string
  featureFlags: FeatureFlags
  runtimeAPIVersion: number
}): Promise<NodeBundlerName> => {
  if ((extension === MODULE_FILE_EXTENSION.MJS && featureFlags.zisi_pure_esm_mjs) || runtimeAPIVersion === 2) {
    return NODE_BUNDLER.NFT
  }

  if (ESBUILD_EXTENSIONS.has(extension)) {
    return NODE_BUNDLER.ESBUILD
  }

  if (featureFlags.traceWithNft) {
    return NODE_BUNDLER.NFT
  }

  const functionIsESM = extname(mainFile) !== MODULE_FILE_EXTENSION.CJS && (await detectEsModule({ mainFile }))

  return functionIsESM ? NODE_BUNDLER.NFT : NODE_BUNDLER.ZISI
}
