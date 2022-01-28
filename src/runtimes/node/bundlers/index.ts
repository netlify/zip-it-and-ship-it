import type { Message } from '@netlify/esbuild'

import { FunctionConfig } from '../../../config.js'
import { FeatureFlag, FeatureFlags } from '../../../feature_flags.js'
import { FunctionSource } from '../../../function.js'
import { detectEsModule } from '../utils/detect_es_module.js'
import { ModuleFormat } from '../utils/module_format.js'

import esbuildBundler from './esbuild/index.js'
import nftBundler from './nft/index.js'
import zisiBundler from './zisi/index.js'

export type NodeBundlerName = 'esbuild' | 'esbuild_zisi' | 'nft' | 'zisi'

// TODO: Create a generic warning type
type BundlerWarning = Message

type CleanupFunction = () => Promise<void>

export type NativeNodeModules = Record<string, Record<string, string | undefined>>

export type BundleFunction = (
  args: {
    basePath?: string
    config: FunctionConfig
    featureFlags: Record<FeatureFlag, boolean>
    pluginsModulesPath?: string
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<{
  // Aliases are used to change the path that a file should take inside the
  // generated archive. For example:
  //
  // "/my-transpiled-function.js" => "/my-function.js"
  //
  // When "/my-transpiled-function.js" is found in the list of files, it will
  // be added to the archive with the "/my-function.js" path.
  aliases?: Map<string, string>

  // Rewrites are used to change the source file associated with a given path.
  // For example:
  //
  // "/my-function.js" => "console.log(`Hello!`)"
  //
  // When "/my-function.js" is found in the list of files, it will be added to
  // the archive with "console.log(`Hello!`)" as its source, replacing whatever
  // the file at "/my-function.js" contains.
  rewrites?: Map<string, string>

  basePath: string
  bundlerWarnings?: BundlerWarning[]
  cleanupFunction?: CleanupFunction
  inputs: string[]
  mainFile: string
  moduleFormat: ModuleFormat
  nativeNodeModules?: NativeNodeModules
  nodeModulesWithDynamicImports?: string[]
  srcFiles: string[]
}>

export type GetSrcFilesFunction = (
  args: {
    basePath?: string
    config: FunctionConfig
    featureFlags: FeatureFlags
    pluginsModulesPath?: string
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<string[]>

interface NodeBundler {
  bundle: BundleFunction
  getSrcFiles: GetSrcFilesFunction
}

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
  const { defaultEsModulesToEsbuild, traceWithNft } = featureFlags

  if (['.mjs', '.ts'].includes(extension)) {
    return 'esbuild'
  }

  if (traceWithNft) {
    return 'nft'
  }

  if (defaultEsModulesToEsbuild) {
    const isEsModule = await detectEsModule({ mainFile })

    if (isEsModule) {
      return 'esbuild'
    }
  }

  return 'zisi'
}
