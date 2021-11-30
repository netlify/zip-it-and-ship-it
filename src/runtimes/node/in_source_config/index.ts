import { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import { nonNullable } from '../../../utils/non_nullable'
import { safelyParseFile } from '../parser'
import { getMainExport } from '../parser/exports'
import { getImports } from '../parser/imports'

import { parse as parseSchedule } from './properties/schedule'

const IN_SOURCE_CONFIG_MODULE = '@netlify/functions'

type ISCValues = Partial<ReturnType<typeof parseSchedule>>

// Parses a JS/TS file and looks for in-source config declarations. It returns
// an array of all declarations found, with `property` indicating the name of
// the property and `data` its value.
const findISCDeclarationsInPath = async (sourcePath: string): Promise<ISCValues> => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return {}
  }

  const imports = ast.body.map((node) => getImports(node, IN_SOURCE_CONFIG_MODULE)).flat()
  const exports = getMainExport(ast.body)
  const iscExports = exports
    .map(({ args, local: exportName }) => {
      const matchingImport = imports.find(({ local: importName }) => importName === exportName)

      if (matchingImport === undefined) {
        return null
      }

      switch (matchingImport.imported) {
        case 'schedule':
          return parseSchedule({ args })

        default:
        // no-op
      }

      return null
    })
    .filter(nonNullable)
  const mergedExports: ISCValues = iscExports.reduce((acc, obj) => ({ ...acc, ...obj }), {})

  return mergedExports
}

type ISCHandlerArg = ArgumentPlaceholder | Expression | SpreadElement | JSXNamespacedName

interface ISCExport {
  local: string
  args: ISCHandlerArg[]
}

export { findISCDeclarationsInPath, IN_SOURCE_CONFIG_MODULE }
export type { ISCExport, ISCHandlerArg, ISCValues }
