import type { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import type { FeatureFlags } from '../../../feature_flags.js'
import { InvocationMode, INVOCATION_MODE } from '../../../function.js'
import { FunctionBundlingUserError } from '../../../utils/error.js'
import { Logger } from '../../../utils/logger.js'
import { nonNullable } from '../../../utils/non_nullable.js'
import { getRoutesFromPath, Route } from '../../../utils/routes.js'
import { RUNTIME } from '../../runtime.js'
import { createBindingsMethod } from '../parser/bindings.js'
import { getExports } from '../parser/exports.js'
import { getImports } from '../parser/imports.js'
import { safelyParseSource, safelyReadSource } from '../parser/index.js'

import { parse as parseSchedule } from './properties/schedule.js'

export const IN_SOURCE_CONFIG_MODULE = '@netlify/functions'

export type ISCValues = {
  invocationMode?: InvocationMode
  routes?: Route[]
  runtimeAPIVersion?: number
  schedule?: string
}

interface FindISCDeclarationsOptions {
  functionName: string
  featureFlags: FeatureFlags
  logger: Logger
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
export const findISCDeclarationsInPath = async (
  sourcePath: string,
  { functionName, featureFlags, logger }: FindISCDeclarationsOptions,
): Promise<ISCValues> => {
  const source = await safelyReadSource(sourcePath)

  if (source === null) {
    return {}
  }

  return findISCDeclarations(source, { functionName, featureFlags, logger })
}

export const findISCDeclarations = (
  source: string,
  { functionName, featureFlags, logger }: FindISCDeclarationsOptions,
): ISCValues => {
  const ast = safelyParseSource(source)

  if (ast === null) {
    return {}
  }

  const imports = ast.body.flatMap((node) => getImports(node, IN_SOURCE_CONFIG_MODULE))
  const scheduledFunctionExpected = imports.some(({ imported }) => imported === 'schedule')

  let scheduledFunctionFound = false
  let scheduleFound = false

  const getAllBindings = createBindingsMethod(ast.body)
  const { configExport, defaultExport, handlerExports } = getExports(ast.body, getAllBindings)
  const isV2API = handlerExports.length === 0 && defaultExport !== undefined

  if (featureFlags.zisi_functions_api_v2 && isV2API) {
    const config: ISCValues = {
      routes: getRoutesFromPath(configExport.path, functionName),
      runtimeAPIVersion: 2,
    }

    logger.system('detected v2 function')

    if (typeof configExport.schedule === 'string') {
      config.schedule = configExport.schedule
    }

    return config
  }

  const iscExports = handlerExports
    .map((exp) => {
      if (exp.type !== 'call-expression') {
        return null
      }

      const { args, local: exportName } = exp
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

  return { ...mergedExports, runtimeAPIVersion: 1 }
}

export type ISCHandlerArg = ArgumentPlaceholder | Expression | SpreadElement | JSXNamespacedName

export type ISCExportWithCallExpression = {
  type: 'call-expression'
  args: ISCHandlerArg[]
  local: string
}
export type ISCExportWithArrowFunctionExpression = { type: 'arrow-function-expression' }
export type ISCExportWithFunctionExpression = { type: 'function-expression' }
export type ISCExport =
  | ISCExportWithArrowFunctionExpression
  | ISCExportWithCallExpression
  | ISCExportWithFunctionExpression
