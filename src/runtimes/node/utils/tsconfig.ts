import { dirname, relative } from 'path'

import { getTsconfig } from 'get-tsconfig'

import { MODULE_FORMAT } from './module_format.js'

const esmModuleValues = new Set(['es6', 'es2015', 'es2020', 'es2022', 'esnext', 'node16', 'nodenext'])

// Returns the module format that should be used for a TypeScript file at a
// given path, by reading the associated `tsconfig.json` file if it exists.
export const getModuleFormat = (path: string, boundary?: string) => {
  const file = getTsconfig(path)

  if (!file) {
    return MODULE_FORMAT.COMMONJS
  }

  // If there is a boundary defined and the file we found is outside of it,
  // discard the file.
  if (boundary !== undefined && relative(boundary, dirname(file.path)).startsWith('..')) {
    return MODULE_FORMAT.COMMONJS
  }

  const moduleProp = file.config.compilerOptions?.module?.toLowerCase() ?? ''

  return esmModuleValues.has(moduleProp) ? MODULE_FORMAT.ESM : MODULE_FORMAT.COMMONJS
}
