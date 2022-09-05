import { ModuleFormat } from './module_format.js'
import { normalizeFilePath } from './normalize_path.js'

export const getEntryFile = ({
  commonPrefix,
  mainFile,
  moduleFormat,
  userNamespace,
}: {
  commonPrefix: string
  mainFile: string
  moduleFormat: ModuleFormat
  userNamespace: string
}) => {
  const mainPath = normalizeFilePath({ commonPrefix, path: mainFile, userNamespace })
  const importPath = `.${mainPath.startsWith('/') ? mainPath : `/${mainPath}`}`

  if (moduleFormat === ModuleFormat.COMMONJS) {
    return `module.exports = require('${importPath}')`
  }

  return `export { handler } from '${importPath}'`
}
