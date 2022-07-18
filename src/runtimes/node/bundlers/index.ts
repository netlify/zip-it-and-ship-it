import { FeatureFlags } from '../../../feature_flags.js'
import { detectEsModule } from '../utils/detect_es_module.js'

import esbuildBundler from './esbuild/index.js'
import nftBundler from './nft/index.js'
import type { NodeBundler, NodeBundlerName } from './types.js'
import zisiBundler from './zisi/index.js'

export const getBundler = (name: NodeBundlerName): NodeBundler => {
  switch (name) {
    case 'esbuild':
    case 'esbuild_zisi':
      return esbuildBundler

    case 'nft':
      return nftBundler

    case 'zisi':
      return zisiBundler

    default:
      throw new Error(`Unsupported Node bundler: ${name}`)
  }
}

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
export const getDefaultBundler = async ({
  extension,
  mainFile,
  featureFlags,
}: {
  extension: string
  mainFile: string
  featureFlags: FeatureFlags
}): Promise<NodeBundlerName> => {
  if (['.mjs', '.ts'].includes(extension)) {
    return 'esbuild'
  }

  if (featureFlags.traceWithNft) {
    return 'nft'
  }

  const functionIsESM = await detectEsModule({ mainFile })

  return functionIsESM ? 'nft' : 'zisi'
}
