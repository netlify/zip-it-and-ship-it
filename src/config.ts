import mergeOptions from 'merge-options'
import minimatch from 'minimatch'

import { FunctionSource } from './function'
import type { NodeBundler } from './runtimes/node'

interface FunctionConfig {
  externalNodeModules?: string[]
  includedFiles?: string[]
  includedFilesBasePath?: string
  ignoredNodeModules?: string[]
  nodeBundler?: NodeBundler
  nodeSourcemap?: boolean
  nodeVersion?: '8.x' | 'nodejs8.x' | '10.x' | 'nodejs10.x' | '12.x' | 'nodejs12.x' | '14.x' | 'nodejs14.x'
  processDynamicNodeImports?: boolean
  rustTargetDirectory?: string
}

const getConfigForFunction = ({
  config,
  func,
}: {
  config: Record<string, FunctionConfig>
  func: FunctionSource
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
export type { FunctionConfig }
