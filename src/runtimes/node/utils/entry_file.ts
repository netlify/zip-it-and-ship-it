import { basename, extname } from 'path'

import { getLayersBootstrap } from './layers.js'
import { ModuleFormat } from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

export interface EntryFile {
  contents: string
  filename: string
}

const getEntryFileContents = (mainPath: string, moduleFormat: string, layers: string[]) => {
  const importPath = `.${mainPath.startsWith('/') ? mainPath : `/${mainPath}`}`

  if (moduleFormat === ModuleFormat.COMMONJS) {
    if (layers.length === 0) {
      return `module.exports = require('${importPath}')`
    }

    const lines = [
      `let handler = require('${importPath}')`,
      ...getLayersBootstrap('handler', layers),
      'module.exports = handler',
    ]

    return lines.join('\n\n')
  }

  return `export { handler } from '${importPath}'`
}

export const getEntryFile = ({
  commonPrefix,
  filename,
  layers,
  mainFile,
  moduleFormat,
  userNamespace,
}: {
  commonPrefix: string
  filename: string
  layers: string[]
  mainFile: string
  moduleFormat: ModuleFormat
  userNamespace: string
}): EntryFile => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const extension = extname(filename)
  const entryFilename = `${basename(filename, extension)}.js`
  const contents = getEntryFileContents(mainPath, moduleFormat, layers)

  return {
    contents,
    filename: entryFilename,
  }
}
