import { basename, extname, resolve } from 'path'

import type { FeatureFlags } from '../../../feature_flags.js'
import { FunctionBundlingUserError } from '../../../utils/error.js'
import { RUNTIME } from '../../runtime.js'

import {
  getFileExtensionForFormat,
  ModuleFileExtension,
  ModuleFormat,
  MODULE_FILE_EXTENSION,
  MODULE_FORMAT,
} from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

export const ENTRY_FILE_NAME = '___netlify-entry-point'
export const BOOTSTRAP_FILE_NAME = '___netlify-bootstrap.mjs'

export interface EntryFile {
  contents: string
  filename: string
}

const getEntryFileContents = (mainPath: string, moduleFormat: string, featureFlags: FeatureFlags) => {
  const importPath = `.${mainPath.startsWith('/') ? mainPath : `/${mainPath}`}`

  if (featureFlags.zisi_functions_api_v2) {
    return [
      `import func from '${importPath}'`,
      `import { getLambdaHandler } from './${BOOTSTRAP_FILE_NAME}'`,
      `export const handler = getLambdaHandler(func)`,
    ].join(';')
  }

  if (featureFlags.zisi_unique_entry_file) {
    // we use dynamic import because we do not know if the user code is cjs or esm
    return [`const{ handler } = await import('${importPath}')`, 'export { handler }'].join(';')
  }

  if (moduleFormat === MODULE_FORMAT.COMMONJS) {
    return `module.exports = require('${importPath}')`
  }

  return `export { handler } from '${importPath}'`
}

// They are in the order that AWS Lambda will try to find the entry point
const POSSIBLE_LAMBDA_ENTRY_EXTENSIONS = [
  MODULE_FILE_EXTENSION.JS,
  MODULE_FILE_EXTENSION.MJS,
  MODULE_FILE_EXTENSION.CJS,
]

// checks if the file is considered a entry-file in AWS Lambda
export const isNamedLikeEntryFile = (
  file: string,
  {
    basePath,
    featureFlags,
    filename,
  }: {
    basePath: string
    featureFlags: FeatureFlags
    filename: string
  },
) =>
  POSSIBLE_LAMBDA_ENTRY_EXTENSIONS.some((extension) => {
    const entryFilename = getEntryFileName({ extension, featureFlags, filename })
    const entryFilePath = resolve(basePath, entryFilename)

    return entryFilePath === file
  })

// Check if any src file (except the mainFile) is considered an entry file for AWS Lambda
export const conflictsWithEntryFile = (
  srcFiles: string[],
  {
    basePath,
    extension,
    featureFlags,
    filename,
    mainFile,
  }: {
    basePath: string
    extension: string
    featureFlags: FeatureFlags
    filename: string
    mainFile: string
  },
) => {
  let hasConflict = false

  srcFiles.forEach((srcFile) => {
    if (srcFile.includes(ENTRY_FILE_NAME)) {
      throw new FunctionBundlingUserError(
        `'${ENTRY_FILE_NAME}' is a reserved word and cannot be used as a file or directory name.`,
        {
          functionName: basename(filename, extension),
          runtime: RUNTIME.JAVASCRIPT,
        },
      )
    }

    // We can skip the next check for the new entry file as we have the check above
    if (featureFlags.zisi_unique_entry_file || featureFlags.zisi_functions_api_v2) {
      return
    }

    if (!hasConflict && isNamedLikeEntryFile(srcFile, { basePath, featureFlags, filename }) && srcFile !== mainFile) {
      hasConflict = true
    }
  })

  return hasConflict
}

// Returns the name for the AWS Lambda entry file
// We do set the handler in AWS Lambda to `<func-name>.handler` and because of
// this it considers `<func-name>.(c|m)?js` as possible entry-points
const getEntryFileName = ({
  extension,
  featureFlags,
  filename,
}: {
  extension: ModuleFileExtension
  featureFlags: FeatureFlags
  filename: string
}) => {
  if (featureFlags.zisi_unique_entry_file || featureFlags.zisi_functions_api_v2) {
    return `${ENTRY_FILE_NAME}.mjs`
  }

  return `${basename(filename, extname(filename))}${extension}`
}

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
  const entryFilename = getEntryFileName({ extension, featureFlags, filename })
  const contents = getEntryFileContents(mainPath, moduleFormat, featureFlags)

  return {
    contents,
    filename: entryFilename,
  }
}
