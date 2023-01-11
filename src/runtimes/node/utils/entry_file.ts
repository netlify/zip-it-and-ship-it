import { basename, extname, resolve } from 'path'

import type { FeatureFlags } from '../../../feature_flags.js'

import { getFileExtensionForFormat, ModuleFileExtension, ModuleFormat } from './module_format.js'
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

// They are in the order that AWS Lambda will try to find the entry point
const POSSIBLE_LAMBDA_ENTRY_EXTENSIONS = [ModuleFileExtension.JS, ModuleFileExtension.MJS, ModuleFileExtension.CJS]

// checks if the file is considered a entry-file in AWS Lambda
export const isNamedLikeEntryFile = (
  file: string,
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

    return entryFilePath === file
  })

// Check if any src file (except the mainFile) is considered an entry file for AWS Lambda
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
) => srcFiles.some((srcFile) => isNamedLikeEntryFile(srcFile, { basePath, filename }) && srcFile !== mainFile)

// Returns the name for the AWS Lambda entry file
// We do set the handler in AWS Lambda to `<func-name>.handler` and because of
// this it considers `<func-name>.(c|m)?js` as possible entry-points
const getEntryFileName = ({ extension, filename }: { extension: ModuleFileExtension; filename: string }) =>
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
