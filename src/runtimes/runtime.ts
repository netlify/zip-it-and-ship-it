import type { ArchiveFormat } from '../archive.js'
import type { FunctionConfig } from '../config.js'
import type { FeatureFlags } from '../feature_flags.js'
import type { FunctionSource, SourceFile } from '../function.js'
import type { RuntimeCache } from '../utils/cache.js'

import type { NodeBundlerType } from './node/bundlers/types.js'
import type { ISCValues } from './node/in_source_config/index.js'

export const enum RuntimeType {
  GO = 'go',
  JAVASCRIPT = 'js',
  RUST = 'rs',
}

export type FindFunctionsInPathsFunction = (args: {
  cache: RuntimeCache
  featureFlags: FeatureFlags
  paths: string[]
}) => Promise<SourceFile[]>

export type FindFunctionInPathFunction = (args: {
  cache: RuntimeCache
  featureFlags: FeatureFlags
  path: string
}) => Promise<SourceFile | undefined>

export type GetSrcFilesFunction = (
  args: {
    basePath?: string
    config: FunctionConfig
    featureFlags: FeatureFlags
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<string[]>

export interface ZipFunctionResult {
  bundler?: NodeBundlerType
  bundlerErrors?: object[]
  bundlerWarnings?: object[]
  config: FunctionConfig
  inputs?: string[]
  includedFiles?: string[]
  inSourceConfig?: ISCValues
  nativeNodeModules?: object
  nodeModulesWithDynamicImports?: string[]
  path: string
}

export type ZipFunction = (
  args: {
    archiveFormat: ArchiveFormat
    basePath?: string
    cache: RuntimeCache
    config: FunctionConfig
    destFolder: string
    featureFlags: FeatureFlags
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<ZipFunctionResult>

export interface Runtime {
  findFunctionsInPaths: FindFunctionsInPathsFunction
  findFunctionInPath: FindFunctionInPathFunction
  getSrcFiles?: GetSrcFilesFunction
  name: RuntimeType
  zipFunction: ZipFunction
}
