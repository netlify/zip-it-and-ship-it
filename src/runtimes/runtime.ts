import type { ArchiveFormat } from '../archive.js'
import type { FunctionConfig } from '../config.js'
import type { FeatureFlags } from '../feature_flags.js'
import type { FunctionSource, InvocationMode, SourceFile } from '../function.js'
import type { ModuleFormat } from '../main.js'
import { ObjectValues } from '../types/utils.js'
import type { RuntimeCache } from '../utils/cache.js'
import { Logger } from '../utils/logger.js'

import type { NodeBundlerName } from './node/bundlers/types.js'
import type { StaticAnalysisResult } from './node/in_source_config/index.js'

export const RUNTIME = {
  GO: 'go',
  JAVASCRIPT: 'js',
  RUST: 'rs',
} as const

export type RuntimeName = ObjectValues<typeof RUNTIME>

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
    runtimeAPIVersion: number
  } & FunctionSource,
) => Promise<string[]>

export interface ZipFunctionResult {
  bundler?: NodeBundlerName
  bundlerErrors?: object[]
  bundlerWarnings?: object[]
  config: FunctionConfig
  displayName?: string
  generator?: string
  inputs?: string[]
  includedFiles?: string[]
  invocationMode?: InvocationMode
  jsModuleFormat?: ModuleFormat
  nativeNodeModules?: object
  path: string
  runtimeVersion?: string
  staticAnalysisResult?: StaticAnalysisResult
  entryFilename: string
}

export type ZipFunction = (
  args: {
    archiveFormat: ArchiveFormat
    basePath?: string
    cache: RuntimeCache
    config: FunctionConfig
    destFolder: string
    featureFlags: FeatureFlags
    generator?: string
    isInternal: boolean
    logger: Logger
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
