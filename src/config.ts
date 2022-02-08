import mergeOptions from 'merge-options'
import minimatch from 'minimatch'

import { FunctionSource } from './function'
import type { NodeVersionString } from './runtimes/node'
import type { NodeBundlerName } from './runtimes/node/bundlers'

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

type GlobPattern = string

type Config = Record<GlobPattern, FunctionConfig>

const getConfigForFunction = ({
  config,
  func,
}: {
  config?: Config
  func: Omit<FunctionSource, 'config'>
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

export { getConfigForFunction }
export type { Config, FunctionConfig }
