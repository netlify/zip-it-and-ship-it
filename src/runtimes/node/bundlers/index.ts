import type { Message } from '@netlify/esbuild'

import { FunctionConfig } from '../../../config'
import { FeatureFlag, FeatureFlags } from '../../../feature_flags'
import { FunctionSource } from '../../../function'
import { detectEsModule } from '../utils/detect_es_module'
import { ModuleFormat } from '../utils/module_format'

import esbuildBundler from './esbuild'
import nftBundler from './nft'
import zisiBundler from './zisi'

export type NodeBundlerName = 'esbuild' | 'esbuild_zisi' | 'nft' | 'zisi'

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

type GetSrcFilesFunction = (
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

// We use ZISI as the default bundler, except for certain extensions, for which
// esbuild is the only option.
const getDefaultBundler = async ({
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

export { getBundler, getDefaultBundler }
export type { BundleFunction, GetSrcFilesFunction, NativeNodeModules }
