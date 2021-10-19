import type { Message } from '@netlify/esbuild'

import { FunctionConfig } from '../../../config'
import { FeatureFlag } from '../../../feature_flags'
import { FunctionSource } from '../../../function'
import { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_NFT, JS_BUNDLER_ZISI } from '../../../utils/consts'
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

const getBundler = (name: string): NodeBundler => {
  switch (name) {
    case JS_BUNDLER_ESBUILD:
    case JS_BUNDLER_ESBUILD_ZISI:
      return esbuildBundler

    case JS_BUNDLER_NFT:
      return nftBundler

    case JS_BUNDLER_ZISI:
      return zisiBundler

    default:
      throw new Error(`Unsupported Node bundler: ${name}`)
  }
}

export { getBundler }
export type { BundleFunction, GetSrcFilesFunction, NativeNodeModules }
