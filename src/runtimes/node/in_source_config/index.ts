import type { ArgumentPlaceholder, Expression, SpreadElement, JSXNamespacedName } from '@babel/types'

import { InvocationMode, INVOCATION_MODE } from '../../../function.js'
import { TrafficRules } from '../../../manifest.js'
import { RateLimitAction, RateLimitAggregator, RateLimitAlgorithm } from '../../../rate_limit.js'
import { FunctionBundlingUserError } from '../../../utils/error.js'
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
  trafficRules?: TrafficRules
  name?: string
  generator?: string
}

export interface StaticAnalysisResult extends ISCValues {
  inputModuleFormat?: ModuleFormat
  invocationMode?: InvocationMode
  runtimeAPIVersion?: number
}

interface FindISCDeclarationsOptions {
  functionName: string
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
 * Extracts the `ratelimit` configuration from the exported config.
 */
const getTrafficRulesConfig = (input: unknown, name: string): TrafficRules | undefined => {
  if (typeof input !== 'object' || input === null) {
    throw new FunctionBundlingUserError(
      `Could not parse ratelimit declaration of function '${name}'. Expecting an object, got ${input}`,
      {
        functionName: name,
        runtime: RUNTIME.JAVASCRIPT,
        bundler: NODE_BUNDLER.ESBUILD,
      },
    )
  }

  const { windowSize, windowLimit, algorithm, aggregateBy, action } = input as Record<string, unknown>

  if (
    typeof windowSize !== 'number' ||
    typeof windowLimit !== 'number' ||
    !Number.isInteger(windowSize) ||
    !Number.isInteger(windowLimit)
  ) {
    throw new FunctionBundlingUserError(
      `Could not parse ratelimit declaration of function '${name}'. Expecting 'windowSize' and 'limitSize' integer properties, got ${input}`,
      {
        functionName: name,
        runtime: RUNTIME.JAVASCRIPT,
        bundler: NODE_BUNDLER.ESBUILD,
      },
    )
  }

  const rateLimitAgg = Array.isArray(aggregateBy) ? aggregateBy : [RateLimitAggregator.Domain]
  const rewriteConfig = 'to' in input && typeof input.to === 'string' ? { to: input.to } : undefined

  return {
    action: {
      type: (action as RateLimitAction) || RateLimitAction.Limit,
      config: {
        ...rewriteConfig,
        rateLimitConfig: {
          windowLimit,
          windowSize,
          algorithm: (algorithm as RateLimitAlgorithm) || RateLimitAlgorithm.SlidingWindow,
        },
        aggregate: {
          keys: rateLimitAgg.map((agg) => ({ type: agg })),
        },
      },
    },
  }
}

/**
 * Loads a file at a given path, parses it into an AST, and returns a series of
 * data points, such as in-source configuration properties and other metadata.
 */
export const parseFile = async (
  sourcePath: string,
  { functionName }: FindISCDeclarationsOptions,
): Promise<StaticAnalysisResult> => {
  const source = await safelyReadSource(sourcePath)

  if (source === null) {
    return {}
  }

  return parseSource(source, { functionName })
}

/**
 * Takes a JS/TS source as a string, parses it into an AST, and returns a
 * series of data points, such as in-source configuration properties and
 * other metadata.
 */
export const parseSource = (source: string, { functionName }: FindISCDeclarationsOptions): StaticAnalysisResult => {
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

    if (typeof configExport.schedule === 'string') {
      result.schedule = configExport.schedule
    }

    if (typeof configExport.name === 'string') {
      result.name = configExport.name
    }

    if (typeof configExport.generator === 'string') {
      result.generator = configExport.generator
    }

    if (configExport.method !== undefined) {
      result.methods = normalizeMethods(configExport.method, functionName)
    }

    result.routes = getRoutes({
      functionName,
      methods: result.methods ?? [],
      path: configExport.path,
      preferStatic: configExport.preferStatic === true,
    })

    if (configExport.rateLimit !== undefined) {
      result.trafficRules = getTrafficRulesConfig(configExport.rateLimit, functionName)
    }

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
export type ISCDefaultExport = { type: 'default' }
export type ISCExport = ISCExportWithCallExpression | ISCExportWithObject | ISCExportOther | ISCDefaultExport
