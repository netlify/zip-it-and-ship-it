import { ArchiveFormat } from '../archive'
import { FunctionConfig } from '../config'
import { FeatureFlags } from '../feature_flags'
import { FunctionArchive, FunctionSource, SourceFile } from '../function'
import { FsCache } from '../utils/fs'

type RuntimeName = 'go' | 'js' | 'rs'

type FindFunctionsInPathsFunction = (args: {
  featureFlags: FeatureFlags
  fsCache: FsCache
  paths: string[]
}) => Promise<SourceFile[]>

type GetSrcFilesFunction = (
  args: {
    basePath?: string
    config: FunctionConfig
    featureFlags: FeatureFlags
    pluginsModulesPath?: string
    repositoryRoot?: string
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
) => Promise<FunctionArchive>

interface Runtime {
  findFunctionsInPaths: FindFunctionsInPathsFunction
  getSrcFiles?: GetSrcFilesFunction
  name: RuntimeName
  zipFunction: ZipFunction
}

export { FindFunctionsInPathsFunction, GetSrcFilesFunction, Runtime, RuntimeName, ZipFunction }
