import { basename, extname, resolve } from 'path'

import type { FeatureFlags } from '../../../feature_flags.js'

import { getFileExtensionForFormat, ModuleFormat } from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

export interface EntryFile {
  contents: string
  filename: string
}

const getEntryFileContents = (mainPath: string, moduleFormat: string) => {
  const importPath = `.${mainPath.startsWith('/') ? mainPath : `/${mainPath}`}`

  if (moduleFormat === ModuleFormat.COMMONJS) {
    return `module.exports = require('${importPath}')`
  }

  return `export { handler } from '${importPath}'`
}

// They are also in the order that AWS Lambda will try to find the entry point
const POSSIBLE_LAMBDA_ENTRY_EXTENSIONS = ['.js', '.mjs', '.cjs']

export const isEntryFile = (
  mainFile: string,
  {
    basePath,
    filename,
  }: {
    basePath: string
    filename: string
  },
) =>
  POSSIBLE_LAMBDA_ENTRY_EXTENSIONS.some((extension) => {
    const entryFilename = getEntryFileName({ extension, filename })
    const entryFilePath = resolve(basePath, entryFilename)

    return entryFilePath === mainFile
  })

export const conflictsWithEntryFile = (
  srcFiles: string[],
  {
    basePath,
    mainFile,
    filename,
  }: {
    basePath: string
    filename: string
    mainFile: string
  },
) =>
  POSSIBLE_LAMBDA_ENTRY_EXTENSIONS.some((extension) => {
    const entryFilename = getEntryFileName({ extension, filename })
    const entryFilePath = resolve(basePath, entryFilename)

    return srcFiles.some((srcFile) => srcFile === entryFilePath && srcFile !== mainFile)
  })

const getEntryFileName = ({ extension, filename }: { extension: string; filename: string }) =>
  `${basename(filename, extname(filename))}${extension}`

export const getEntryFile = ({
  commonPrefix,
  featureFlags,
  filename,
  mainFile,
  moduleFormat,
  userNamespace,
}: {
  commonPrefix: string
  featureFlags: FeatureFlags
  filename: string
  mainFile: string
  moduleFormat: ModuleFormat
  userNamespace: string
}): EntryFile => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const extension = getFileExtensionForFormat(moduleFormat, featureFlags)
  const entryFilename = getEntryFileName({ extension, filename })
  const contents = getEntryFileContents(mainPath, moduleFormat)

  return {
    contents,
    filename: entryFilename,
  }
}
