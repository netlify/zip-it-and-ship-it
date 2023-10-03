import { dirname, relative } from 'path'

import { getTsconfig, TsConfigJson } from 'get-tsconfig'

import { MODULE_FORMAT } from './module_format.js'

export type { TsConfigJson as TsConfig } from 'get-tsconfig'

const esmModuleValues = new Set(['es6', 'es2015', 'es2020', 'es2022', 'esnext', 'node16', 'nodenext'])

/**
 * Returns a `tsconfig.json` file optimized for functionsc using the V2 API.
 * If a user-defined file is found, that file is loaded and extended with a
 * set of configuration properties that the user can't override.
 */
export const getTSConfigForV2Function = (path: string, boundary?: string): TsConfigJson => {
  const userConfig = getTSConfigInProject(path, boundary) || {}

  return {
    ...userConfig,
    compilerOptions: {
      ...userConfig.compilerOptions,
      module: 'es2022',
      moduleResolution: 'node',
      esModuleInterop: true,
    },
  }
}

/**
 * Looks for a `tsconfig.json` file applicable to a given path and returns the
 * contents as an object. If a boundary is set, we'll stop traversing the file
 * system once that path is reached.
 */
const getTSConfigInProject = (path: string, boundary?: string): TsConfigJson | undefined => {
  const file = getTsconfig(path)

  if (!file) {
    return
  }

  // If there is a boundary defined and the file we found is outside of it,
  // discard the file.
  if (boundary !== undefined && relative(boundary, dirname(file.path)).startsWith('..')) {
    return
  }

  return file.config
}

/**
 * Looks for a `tsconfig.json` file on a given path and, if one exists, returns
 * the module format inferred from the `module` property. If no file is found
 * or if no `module` property is defined, the function returns `undefined`.
 */
export const getModuleFormat = (path: string, boundary?: string) => {
  const config = getTSConfigInProject(path, boundary)

  if (!config) {
    return
  }

  const moduleProp = config.compilerOptions?.module

  if (!moduleProp) {
    return
  }

  return esmModuleValues.has(moduleProp) ? MODULE_FORMAT.ESM : MODULE_FORMAT.COMMONJS
}
