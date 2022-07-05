import { ArchiveFormat } from '../archive.js'
import { FunctionConfig } from '../config.js'
import { FeatureFlags } from '../feature_flags.js'
import { FunctionSource, SourceFile } from '../function.js'
import { FsCache } from '../utils/fs.js'

import type { NodeBundlerName } from './node/bundlers/index.js'
import type { ISCValues } from './node/in_source_config/index.js'

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
