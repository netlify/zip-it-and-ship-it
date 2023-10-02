import { dirname, relative } from 'path'

import { getTsconfig } from 'get-tsconfig'

import { MODULE_FORMAT } from './module_format.js'

const esmModuleValues = new Set(['es6', 'es2015', 'es2020', 'es2022', 'esnext', 'node16', 'nodenext'])

/**
 * Looks for a `tsconfig.json` file on a given path and, if one exists, returns
 * the module format inferred from the `module` property. If no file is found
 * or if no `module` property is defined, the function returns `undefined`.
 */
export const getModuleFormat = (path: string, boundary?: string) => {
  const file = getTsconfig(path)

  if (!file) {
    return
  }

  // If there is a boundary defined and the file we found is outside of it,
  // discard the file.
  if (boundary !== undefined && relative(boundary, dirname(file.path)).startsWith('..')) {
    return
  }

  const moduleProp = file.config.compilerOptions?.module

  if (!moduleProp) {
    return
  }

  return esmModuleValues.has(moduleProp) ? MODULE_FORMAT.ESM : MODULE_FORMAT.COMMONJS
}
