import { promises as fs } from 'fs'
import { basename, extname, dirname, join } from 'path'

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

interface FunctionConfigFile {
  config: FunctionConfig
  version: number
}

interface FunctionInSourceConfig {
  nodeBundler?: NodeBundlerName,
  includedFiles?: string[]
}

type GlobPattern = string

type Config = Record<GlobPattern, FunctionConfig>
type FunctionWithoutConfig = Omit<FunctionSource, 'config'>

const getConfigForFunction = async ({
  config,
  configFileDirectories,
  func,
}: {
  config?: Config
  configFileDirectories?: string[]
  func: FunctionWithoutConfig
}): Promise<FunctionConfig> => {
  let fromConfig = getFromMainConfig({ config, func })

  const inSourceConfig = await getConfigObjectFromFunction(func.mainFile)

  if (Object.keys(inSourceConfig).length !== 0) {
    // inSourceConfig config values are preferred to the main config values
    fromConfig = { ...fromConfig, ...inSourceConfig }
  }

  // We try to read from a function config file if the function directory is
  // inside one of `configFileDirectories`.
  const shouldReadConfigFile = configFileDirectories?.some((directory) => func.srcDir.startsWith(directory))

  if (!shouldReadConfigFile) {
    return fromConfig
  }

  const fromFile = await getFromFile(func)

  return {
    ...fromConfig,
    ...fromFile,
  }
}

const getFromMainConfig = ({
  config,
  func,
}: {
  config?: Config
  configFileDirectories?: string[]
  func: FunctionWithoutConfig
}): FunctionConfig => {
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

const getFromFile = async (func: FunctionWithoutConfig): Promise<FunctionConfig> => {
  const filename = `${basename(func.mainFile, extname(func.mainFile))}.json`
  const configFilePath = join(dirname(func.mainFile), filename)

  try {
    const data = await fs.readFile(configFilePath, 'utf8')
    const configFile = JSON.parse(data) as FunctionConfigFile

    if (configFile.version === 1) {
      return configFile.config
    }
  } catch {
    // no-op
  }

  return {}
}

const getConfigObjectFromFunction = async (sourcePath: string) => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return {}
  }

  const configObj = getConfigExport(ast.body, createBindingsMethod(ast.body))

  const testObj: any = []

  // eslint-disable-next-line array-callback-return
  configObj.map(({ args }) => {
    args.forEach((arg) => {
      testObj.push({
        // eslint-disable-next-line max-nested-callbacks
        [arg.key.name]:
          // eslint-disable-next-line max-nested-callbacks
          arg.value.type === 'ArrayExpression' ? arg.value.elements.map((val: any) => val.value) : arg.value.value,
      })
    })
  })

  const configObject: any = {}

  for (const element of testObj) {
    // eslint-disable-next-line prefer-destructuring
    configObject[Object.keys(element)[0]] = Object.values(element)[0]
  }

  return configObject
}

export { Config, FunctionConfig, FunctionWithoutConfig, getConfigForFunction }
