import { Stats } from 'fs'

import type { FunctionConfig } from './config'
import type { Runtime, ZipFunctionResult } from './runtimes/runtime'

// A function that has been processed and turned into an archive.
export type FunctionArchive = ZipFunctionResult & {
  mainFile: string
  name: string
  runtime: Runtime
  size?: number
}

// A function file found on the filesystem.
export interface SourceFile {
  extension: string
  filename: string
  mainFile: string
  name: string
  srcDir: string
  srcPath: string
  stat: Stats
}

// A function associated with a runtime.
export type FunctionSource = SourceFile & {
  config: FunctionConfig
  runtime: Runtime
}
