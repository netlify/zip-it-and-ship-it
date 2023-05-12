import type { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import { InvocationMode, INVOCATION_MODE } from '../../../function.js'
import { FunctionBundlingUserError } from '../../../utils/error.js'
import { nonNullable } from '../../../utils/non_nullable.js'
import { RUNTIME } from '../../runtime.js'
import { createBindingsMethod } from '../parser/bindings.js'
import { getMainExport } from '../parser/exports.js'
import { getImports } from '../parser/imports.js'
import { safelyParseFile } from '../parser/index.js'

import { parse as parseSchedule } from './properties/schedule.js'

export const IN_SOURCE_CONFIG_MODULE = '@netlify/functions'

export type ISCValues = {
  invocationMode?: InvocationMode
  schedule?: string
}

const validateScheduleFunction = (functionFound: boolean, scheduleFound: boolean, functionName: string): void => {
  if (!functionFound) {
    throw new FunctionBundlingUserError(
      "The `schedule` helper was imported but we couldn't find any usages. If you meant to schedule a function, please check that `schedule` is invoked and `handler` correctly exported.",
      { functionName, runtime: RUNTIME.JAVASCRIPT },
    )
  }

  if (!scheduleFound) {
    throw new FunctionBundlingUserError(
      'Unable to find cron expression for scheduled function. The cron expression (first argument) for the `schedule` helper needs to be accessible inside the file and cannot be imported.',
      { functionName, runtime: RUNTIME.JAVASCRIPT },
    )
  }
}

// Parses a JS/TS file and looks for in-source config declarations. It returns
// an array of all declarations found, with `property` indicating the name of
// the property and `data` its value.
export const findISCDeclarationsInPath = async (sourcePath: string, functionName: string): Promise<ISCValues> => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return {}
  }

  const imports = ast.body.flatMap((node) => getImports(node, IN_SOURCE_CONFIG_MODULE))

  const scheduledFunctionExpected = imports.some(({ imported }) => imported === 'schedule')
  let scheduledFunctionFound = false
  let scheduleFound = false

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

          scheduledFunctionFound = true
          if (parsed.schedule) {
            scheduleFound = true
          }

          return parsed
        }

        case 'stream': {
          return {
            invocationMode: INVOCATION_MODE.Stream,
          }
        }

        default:
        // no-op
      }

      return null
    })
    .filter(nonNullable)

  if (scheduledFunctionExpected) {
    validateScheduleFunction(scheduledFunctionFound, scheduleFound, functionName)
  }

  const mergedExports: ISCValues = iscExports.reduce((acc, obj) => ({ ...acc, ...obj }), {})

  return mergedExports
}

export type ISCHandlerArg = ArgumentPlaceholder | Expression | SpreadElement | JSXNamespacedName

export interface ISCExport {
  local: string
  args: ISCHandlerArg[]
}
