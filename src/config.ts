import { promises as fs } from 'fs'
import { basename, extname, dirname, join } from 'path'

import isPathInside from 'is-path-inside'
// @ts-expect-error Typescript cannot find definition
import mergeOptions from 'merge-options'

import { FunctionSource } from './function.js'
import type { NodeBundlerName } from './runtimes/node/bundlers/types.js'
import type { ModuleFormat } from './runtimes/node/utils/module_format.js'
import { minimatch } from './utils/matching.js'

interface FunctionConfig {
  externalNodeModules?: string[]
  includedFiles?: string[]
  includedFilesBasePath?: string
  ignoredNodeModules?: string[]
  nodeBundler?: NodeBundlerName
  nodeSourcemap?: boolean
  nodeVersion?: string
  rustTargetDirectory?: string
  schedule?: string
  zipGo?: boolean
  name?: string
  generator?: string

  // Temporary configuration property, only meant to be used by the deploy
  // configuration API. Once we start emitting ESM files for all ESM functions,
  // we can remove this.
  nodeModuleFormat?: ModuleFormat
}

interface FunctionConfigFile {
  config: FunctionConfig
  version: number
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
  const fromConfig = getFromMainConfig({ config, func })

  // We try to read from a function config file if the function directory is
  // inside one of `configFileDirectories`.
  const shouldReadConfigFile = configFileDirectories?.some((directory) => isPathInside(func.mainFile, directory))

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

export { Config, FunctionConfig, FunctionWithoutConfig, getConfigForFunction }
