import { getTsconfig } from 'get-tsconfig'

import { MODULE_FORMAT } from './module_format.js'

const esmModuleValues = new Set(['es2020', 'es2022', 'esnext', 'node16', 'nodenext'])

export const getModuleFormat = (path: string) => {
  const file = getTsconfig(path)

  if (!file) {
    return MODULE_FORMAT.COMMONJS
  }

  const moduleProp = file.config.compilerOptions?.module?.toLowerCase() ?? ''

  return esmModuleValues.has(moduleProp) ? MODULE_FORMAT.ESM : MODULE_FORMAT.COMMONJS
}
