import { basename, extname } from 'path'

import type { ModuleFormat } from './module_format'
import { normalizeFilePath } from './normalize_path'

interface EntryFile {
  contents: string
  filename: string
}

const getEntryFileContents = (mainPath: string, moduleFormat: string) => {
  const importPath = `.${mainPath.startsWith('/') ? mainPath : `/${mainPath}`}`

  if (moduleFormat === 'cjs') {
    return `module.exports = require('${importPath}')`
  }

  return `export { handler } from '${importPath}'`
}

const getEntryFile = ({
  commonPrefix,
  filename,
  mainFile,
  moduleFormat,
  userNamespace,
}: {
  commonPrefix: string
  filename: string
  mainFile: string
  moduleFormat: ModuleFormat
  userNamespace: string
}): EntryFile => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const extension = extname(filename)
  const entryFilename = `${basename(filename, extension)}.js`
  const contents = getEntryFileContents(mainPath, moduleFormat)

  return {
    contents,
    filename: entryFilename,
  }
}

export { EntryFile, getEntryFile }
