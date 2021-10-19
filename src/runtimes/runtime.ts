import { ArchiveFormat } from '../archive'
import { FunctionConfig } from '../config'
import { FeatureFlags } from '../feature_flags'
import { FunctionSource, SourceFile } from '../function'
import { FsCache } from '../utils/fs'

import type { NodeBundler } from './node'

type FindFunctionsInPathsFunction = (args: {
  featureFlags: FeatureFlags
  fsCache: FsCache
  paths: string[]
}) => Promise<SourceFile[]>

type GetSrcFilesFunction = (
  args: {
    basePath: string
    config: FunctionConfig
    featureFlags: FeatureFlags
    pluginsModulesPath: string
  } & FunctionSource,
) => Promise<string[]>

type ZipFunction = (
  args: {
    archiveFormat: ArchiveFormat
    basePath?: string
    config: FunctionConfig
    destFolder: string
    featureFlags: FeatureFlags
    pluginsModulesPath?: string
    repositoryRoot?: string
  } & FunctionSource,
) => Promise<{
  bundler?: NodeBundler
  bundlerWarnings?: object[]
  config: FunctionConfig
  inputs?: string[]
  nativeNodeModules?: object
  nodeModulesWithDynamicImports?: string[]
  path: string
}>

interface Runtime {
  findFunctionsInPaths: FindFunctionsInPathsFunction
  getSrcFiles?: GetSrcFilesFunction
  name: string
  zipFunction: ZipFunction
}

export { FindFunctionsInPathsFunction, GetSrcFilesFunction, Runtime, ZipFunction }
