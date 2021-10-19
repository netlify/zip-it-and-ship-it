import { Stats } from 'fs'

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
  runtime: Runtime
}

export { FunctionSource, SourceFile }
