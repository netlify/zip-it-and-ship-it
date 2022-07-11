import mergeOptions from 'merge-options'

import { FunctionSource } from './function.js'
import type { NodeBundlerName } from './runtimes/node/bundlers/index.js'
import type { NodeVersionString } from './runtimes/node/index.js'
import { createBindingsMethod } from './runtimes/node/parser/bindings.js'
import { getConfigExport } from './runtimes/node/parser/exports.js'
import { safelyParseFile } from './runtimes/node/parser/index.js'
import { minimatch } from './utils/matching.js'

interface FunctionConfig {
  externalNodeModules?: string[]
  includedFiles?: string[]
  includedFilesBasePath?: string
  ignoredNodeModules?: string[]
  nodeBundler?: NodeBundlerName
  nodeSourcemap?: boolean
  nodeVersion?: NodeVersionString
  processDynamicNodeImports?: boolean
  rustTargetDirectory?: string
  schedule?: string
  zipGo?: boolean
}

interface FunctionInSourceConfig {
  nodeBundler?: NodeBundlerName
  includedFiles?: string[]
}

type GlobPattern = string

type Config = Record<GlobPattern, FunctionConfig>
type FunctionWithoutConfig = Omit<FunctionSource, 'config'>

const getConfigForFunction = async ({
  config,
  func,
}: {
  config?: Config
  func: FunctionWithoutConfig
}): Promise<FunctionConfig> => {
  let fromConfig = getFromMainConfig({ config, func })

  const inSourceConfig: FunctionInSourceConfig = await getConfigObjectFromFunction(func.mainFile)

  if (Object.keys(inSourceConfig).length !== 0) {
    // inSourceConfig config values are preferred to the main config values
    fromConfig = { ...fromConfig, ...inSourceConfig }
  }

  return fromConfig
}

const getFromMainConfig = ({ config, func }: { config?: Config; func: FunctionWithoutConfig }): FunctionConfig => {
  if (!config) {
    return {}
  }

  // It's safe to mutate the array because it's local to this function.
  const matches = Object.keys(config)
    .filter((expression) => minimatch(func.name, expression))
    .map((expression) => {
      const wildcardCount = [...expression].filter((char) => char === '*').length

      // The weight increases with the number of hardcoded (i.e. non-wildcard)
      // characters — e.g. "netlify" has a higher weight than "net*". We do a
      // subtraction of 1 if there is at least one wildcard character, so that
      // "netlify" has a higher weight than "netlify*".
      const weight = expression.length - wildcardCount - (wildcardCount === 0 ? 0 : 1)

      return {
        expression,
        weight,
      }
    })
    .sort(({ weight: weightA }, { weight: weightB }) => weightA - weightB)
    .map(({ expression }) => config[expression])

  return mergeOptions.apply({ concatArrays: true, ignoreUndefined: true }, matches)
}

const getConfigObjectFromFunction = async (sourcePath: string): Promise<FunctionInSourceConfig> => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return {}
  }

  const configObj = getConfigExport(ast.body, createBindingsMethod(ast.body))

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let configObject: any = {}

  configObj.map(({ args }) =>
    args.forEach((arg: any) => {
      configObject = {
        ...configObject,
        [arg.key.name]:
          // eslint-disable-next-line max-nested-callbacks
          arg.value.type === 'ArrayExpression' ? arg.value.elements.map((val: any) => val.value) : arg.value.value,
      }
    }),
  )
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return configObject
}

export { Config, FunctionConfig, FunctionWithoutConfig, getConfigForFunction }
