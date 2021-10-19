import { Stats } from 'fs'

import type { FunctionConfig } from './config'
import type { Runtime } from './runtimes/runtime'

interface SourceFile {
  extension: string
  filename: string
  mainFile: string
  name: string
  srcDir: string
  srcPath: string
  stat: Stats
}

type FunctionSource = SourceFile & {
  config: FunctionConfig
  runtime: Runtime
}

export { FunctionSource, SourceFile }
