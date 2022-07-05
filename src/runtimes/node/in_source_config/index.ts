import { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import { nonNullable } from '../../../utils/non_nullable.js'
import { createBindingsMethod } from '../parser/bindings.js'
import { getMainExport } from '../parser/exports.js'
import { getImports } from '../parser/imports.js'
import { safelyParseFile } from '../parser/index.js'

import { parse as parseSchedule } from './properties/schedule.js'

export const IN_SOURCE_CONFIG_MODULE = '@netlify/functions'

export type ISCValues = Partial<ReturnType<typeof parseSchedule>>

// Parses a JS/TS file and looks for in-source config declarations. It returns
// an array of all declarations found, with `property` indicating the name of
// the property and `data` its value.
export const findISCDeclarationsInPath = async (sourcePath: string): Promise<ISCValues> => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return {}
  }

  const imports = ast.body.flatMap((node) => getImports(node, IN_SOURCE_CONFIG_MODULE))

  const scheduledFuncsExpected = imports.filter(({ imported }) => imported === 'schedule').length
  let scheduledFuncsFound = 0

  const getAllBindings = createBindingsMethod(ast.body)
  const mainExports = getMainExport(ast.body, getAllBindings)
  const iscExports = mainExports
    .map(({ args, local: exportName }) => {
      const matchingImport = imports.find(({ local: importName }) => importName === exportName)

      if (matchingImport === undefined) {
        return null
      }

      switch (matchingImport.imported) {
        case 'schedule': {
          const parsed = parseSchedule({ args }, getAllBindings)

          if (parsed.schedule) {
            scheduledFuncsFound += 1
          }

          return parsed
        }
        default:
        // no-op
      }

      return null
    })
    .filter(nonNullable)

  if (scheduledFuncsFound < scheduledFuncsExpected) {
    throw new Error(
      'Warning: unable to find cron expression for scheduled function. `schedule` imported but not called or exported. If you meant to schedule a function, please check that `schedule` is invoked with an appropriate cron expression.',
    )
  }

  const mergedExports: ISCValues = iscExports.reduce((acc, obj) => ({ ...acc, ...obj }), {})

  return mergedExports
}

export type ISCHandlerArg = ArgumentPlaceholder | Expression | SpreadElement | JSXNamespacedName

export interface ISCExport {
  local: string
  args: ISCHandlerArg[]
}
