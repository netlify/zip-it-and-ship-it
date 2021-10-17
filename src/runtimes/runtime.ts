import { FunctionConfig } from '../config'
import { FeatureFlags } from '../feature_flags'
import { FunctionSource, SourceFile } from '../function'

import type { NodeBundler } from './node'
// TODO: Move to a file outside of the Node runtime directory.
import { ArchiveFormat } from './node/utils/zip'

interface FindFunctionsInPathsFunction {
  (args: { featureFlags: FeatureFlags; fsCache: Record<string, Promise<any>>; paths: string[] }): Promise<SourceFile[]>
}

interface GetSrcFilesFunction {
  (
    args: {
      basePath: string
      config: FunctionConfig
      featureFlags: FeatureFlags
      pluginsModulesPath: string
    } & FunctionSource,
  ): Promise<string[]>
}

interface ZipFunction {
  (
    args: {
      archiveFormat: ArchiveFormat
      basePath: string
      config: FunctionConfig
      destFolder: string
      featureFlags: FeatureFlags
      pluginsModulesPath: string
      repositoryRoot: string
    } & FunctionSource,
  ): Promise<{
    bundler?: NodeBundler
    bundlerWarnings?: object[]
    config: FunctionConfig
    inputs?: string[]
    nativeNodeModules?: object
    nodeModulesWithDynamicImports?: string[]
    path: string
  }>
}

interface Runtime {
  findFunctionsInPaths: FindFunctionsInPathsFunction
  getSrcFiles: GetSrcFilesFunction
  name: string
  zipFunction: ZipFunction
}

export { FindFunctionsInPathsFunction, GetSrcFilesFunction, Runtime, ZipFunction }
