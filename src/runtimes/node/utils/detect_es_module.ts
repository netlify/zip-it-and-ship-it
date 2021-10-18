import { readFile } from 'fs'
import { promisify } from 'util'

import { init, parse } from 'es-module-lexer'

const pReadFile = promisify(readFile)

const detectEsModule = async ({ mainFile }: { mainFile: string }): Promise<boolean> => {
  if (!mainFile) {
    return false
  }

  try {
    const [mainFileContents] = await Promise.all([pReadFile(mainFile, 'utf8'), init])
    const [imports, exports] = parse(mainFileContents)

    return imports.length !== 0 || exports.length !== 0
  } catch {
    // If there are any problems with init or parsing, assume it's not an ES module
    return false
  }
}

export { detectEsModule }
