import type { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import { InvocationMode, INVOCATION_MODE } from '../../../function.js'
import { FunctionBundlingUserError } from '../../../utils/error.js'
import { Logger } from '../../../utils/logger.js'
import { nonNullable } from '../../../utils/non_nullable.js'
import { getRoutes, Route } from '../../../utils/routes.js'
import { RUNTIME } from '../../runtime.js'
import { NODE_BUNDLER } from '../bundlers/types.js'
import { createBindingsMethod } from '../parser/bindings.js'
import { traverseNodes } from '../parser/exports.js'
import { getImports } from '../parser/imports.js'
import { safelyParseSource, safelyReadSource } from '../parser/index.js'
import type { ModuleFormat } from '../utils/module_format.js'

import { parse as parseSchedule } from './properties/schedule.js'

export const IN_SOURCE_CONFIG_MODULE = '@netlify/functions'

export type ISCValues = {
  routes?: Route[]
  schedule?: string
  methods?: string[]
}

export interface StaticAnalysisResult extends ISCValues {
  inputModuleFormat?: ModuleFormat
  invocationMode?: InvocationMode
  runtimeAPIVersion?: number
}

interface FindISCDeclarationsOptions {
  functionName: string
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

/**
 * Normalizes method names into arrays of uppercase strings.
 * (e.g. "get" becomes ["GET"])
 */
const normalizeMethods = (input: unknown, name: string): string[] | undefined => {
  const methods = Array.isArray(input) ? input : [input]

  return methods.map((method) => {
    if (typeof method !== 'string') {
      throw new FunctionBundlingUserError(
        `Could not parse method declaration of function '${name}'. Expecting HTTP Method, got ${method}`,
        {
          functionName: name,
          runtime: RUNTIME.JAVASCRIPT,
          bundler: NODE_BUNDLER.ESBUILD,
        },
      )
    }

    return method.toUpperCase()
  })
}

/**
 * Loads a file at a given path, parses it into an AST, and returns a series of
 * data points, such as in-source configuration properties and other metadata.
 */
export const parseFile = async (
  sourcePath: string,
  { functionName, logger }: FindISCDeclarationsOptions,
): Promise<StaticAnalysisResult> => {
  const source = await safelyReadSource(sourcePath)

  if (source === null) {
    return {}
  }

  return parseSource(source, { functionName, logger })
}

/**
 * Takes a JS/TS source as a string, parses it into an AST, and returns a
 * series of data points, such as in-source configuration properties and
 * other metadata.
 */
export const parseSource = (
  source: string,
  { functionName, logger }: FindISCDeclarationsOptions,
): StaticAnalysisResult => {
  const ast = safelyParseSource(source)

  if (ast === null) {
    return {}
  }

  const imports = ast.body.flatMap((node) => getImports(node, IN_SOURCE_CONFIG_MODULE))
  const scheduledFunctionExpected = imports.some(({ imported }) => imported === 'schedule')

  let scheduledFunctionFound = false
  let scheduleFound = false

  const getAllBindings = createBindingsMethod(ast.body)
  const { configExport, handlerExports, hasDefaultExport, inputModuleFormat } = traverseNodes(ast.body, getAllBindings)
  const isV2API = handlerExports.length === 0 && hasDefaultExport

  if (isV2API) {
    const result: StaticAnalysisResult = {
      inputModuleFormat,
      runtimeAPIVersion: 2,
    }

    logger.system('detected v2 function')

    if (typeof configExport.schedule === 'string') {
      result.schedule = configExport.schedule
    }

    if (configExport.method !== undefined) {
      result.methods = normalizeMethods(configExport.method, functionName)
    }

    result.routes = getRoutes(configExport.path, functionName, result.methods ?? [])

    return result
  }

  const iscExports = handlerExports
    .map((node) => {
      // We're only interested in exports with call expressions, since that's
      // the pattern we use for the wrapper functions.
      if (node.type !== 'call-expression') {
        return null
      }

      const { args, local: exportName } = node
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

  return { ...mergedExports, inputModuleFormat, runtimeAPIVersion: 1 }
}

export type ISCHandlerArg = ArgumentPlaceholder | Expression | SpreadElement | JSXNamespacedName

export type ISCExportWithCallExpression = {
  type: 'call-expression'
  args: ISCHandlerArg[]
  local: string
}
export type ISCExportWithObject = {
  type: 'object-expression'
  object: Record<string, unknown>
}
export type ISCExportOther = { type: 'other' }
export type ISCExport = ISCExportWithCallExpression | ISCExportWithObject | ISCExportOther
