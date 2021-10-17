import { Stats } from 'fs'

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
  runtime: string
}

export { FunctionSource, SourceFile }
