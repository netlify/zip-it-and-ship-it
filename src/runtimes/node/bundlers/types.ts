import type { Message } from '@netlify/esbuild'

import type { FunctionConfig } from '../../../config.js'
import type { FeatureFlag, FeatureFlags } from '../../../feature_flags.js'
import type { FunctionSource } from '../../../function.js'
import type { ModuleFormat } from '../utils/module_format.js'

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
  includedFiles: string[]
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
) => Promise<{ srcFiles: string[]; includedFiles: string[] }>

export interface NodeBundler {
  bundle: BundleFunction
  getSrcFiles: GetSrcFilesFunction
}
