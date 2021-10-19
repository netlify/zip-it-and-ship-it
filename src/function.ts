import { Stats } from 'fs'

import type { FunctionConfig } from './config'
import type { NodeBundler } from './runtimes/node'
import type { Runtime } from './runtimes/runtime'

// A function that has been processed and turned into an archive.
interface FunctionArchive {
  bundler?: NodeBundler
  bundlerWarnings?: object[]
  config: FunctionConfig
  inputs?: string[]
  nativeNodeModules?: object
  nodeModulesWithDynamicImports?: string[]
  path: string
}

// A function file found on the filesystem.
interface SourceFile {
  extension: string
  filename: string
  mainFile: string
  name: string
  srcDir: string
  srcPath: string
  stat: Stats
}

// A function associated with a runtime.
type FunctionSource = SourceFile & {
  config: FunctionConfig
  runtime: Runtime
}

export { FunctionSource, FunctionArchive, SourceFile }
