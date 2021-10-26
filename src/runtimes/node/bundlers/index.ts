import type { Message } from '@netlify/esbuild'

import type { NodeBundlerName } from '..'
import { FunctionConfig } from '../../../config'
import { FeatureFlag } from '../../../feature_flags'
import { FunctionSource } from '../../../function'
import { GetSrcFilesFunction } from '../../runtime'

import esbuildBundler from './esbuild'
import nftBundler from './nft'
import zisiBundler from './zisi'

// TODO: Create a generic warning type
type BundlerWarning = Message

type CleanupFunction = () => Promise<void>

type NativeNodeModules = Record<string, Record<string, string | undefined>>

type BundleFunction = (
  args: {
    basePath?: string
    config: FunctionConfig
    featureFlags: Record<FeatureFlag, boolean>
    pluginsModulesPath?: string
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<{
  aliases?: Map<string, string>
  basePath: string
  bundlerWarnings?: BundlerWarning[]
  cleanupFunction?: CleanupFunction
  inputs: string[]
  mainFile: string
  nativeNodeModules?: NativeNodeModules
  nodeModulesWithDynamicImports?: string[]
  srcFiles: string[]
}>

interface NodeBundler {
  bundle: BundleFunction
  getSrcFiles: GetSrcFilesFunction
}

const getBundler = (name: NodeBundlerName): NodeBundler => {
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

export { getBundler }
export type { BundleFunction, GetSrcFilesFunction, NativeNodeModules }
