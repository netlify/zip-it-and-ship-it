import { Stats } from 'fs'

interface FunctionSource {
  extension: string
  mainFile: string
  name: string
  srcDir: string
  srcPath: string
  stat: Stats
}

export { FunctionSource }
