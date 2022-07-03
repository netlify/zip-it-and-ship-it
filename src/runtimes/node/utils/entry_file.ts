import { basename, extname } from 'path'

import { FeatureFlags } from '../../../feature_flags.js'
import { getRuntimeLayer } from '../runtime_layer/index.js'

import type { ModuleFormat } from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

export interface EntryFile {
  contents: string
  filename: string
}

const getEntryFileContents = (importPath: string, moduleFormat: string) => {
  if (moduleFormat === 'cjs') {
    return `module.exports = require('${importPath}')`
  }

  return `export { handler } from '${importPath}'`
}

const getImportPath = (modulePath: string) => `.${modulePath.startsWith('/') ? modulePath : `/${modulePath}`}`

export const getEntryFile = async ({
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
}): Promise<EntryFile> => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const extension = extname(filename)
  const entryFilename = `${basename(filename, extension)}.js`
  const importPath = getImportPath(mainPath)

  const contents = featureFlags.zisi_functions_api_v2
    ? await getRuntimeLayer(importPath, moduleFormat)
    : getEntryFileContents(importPath, moduleFormat)

  return {
    contents,
    filename: entryFilename,
  }
}
