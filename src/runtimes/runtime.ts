import { ArchiveFormat } from '../archive'
import { FunctionConfig } from '../config'
import { FeatureFlags } from '../feature_flags'
import { FunctionSource, SourceFile } from '../function'
import { FsCache } from '../utils/fs'

import type { NodeBundlerName } from './node/bundlers'
import type { ISCValues } from './node/in_source_config'

export type RuntimeName = 'go' | 'js' | 'rs'

export type FindFunctionsInPathsFunction = (args: {
  featureFlags: FeatureFlags
  fsCache: FsCache
  paths: string[]
}) => Promise<SourceFile[]>

export type FindFunctionInPathFunction = (args: {
  featureFlags: FeatureFlags
  fsCache: FsCache
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
  bundler?: NodeBundlerName
  bundlerErrors?: object[]
  bundlerWarnings?: object[]
  config: FunctionConfig
  inputs?: string[]
  inSourceConfig?: ISCValues
  nativeNodeModules?: object
  nodeModulesWithDynamicImports?: string[]
  path: string
}

export type ZipFunction = (
  args: {
    archiveFormat: ArchiveFormat
    basePath?: string
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
  name: RuntimeName
  zipFunction: ZipFunction
}
