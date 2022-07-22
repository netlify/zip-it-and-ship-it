import { extname, basename } from 'path'

import { Config, getConfigForFunction, FunctionWithoutConfig } from '../config.js'
import { defaultFlags, FeatureFlags } from '../feature_flags.js'
import { FunctionSource } from '../function.js'
import { FsCache } from '../utils/fs.js'

import goRuntime from './go/index.js'
import jsRuntime from './node/index.js'
import type { Runtime } from './runtime.js'
import rustRuntime from './rust/index.js'

// A `Map` of functions, indexed by their name.
type FunctionMap = Map<string, FunctionSource>

// A tuple containing the name of a function and the object describing it.
// This is compatible with the constructor of `FunctionMap`.
type FunctionTuple = [string, FunctionSource]

// The same as `FunctionTuple` but functions don't have a `config` object yet.
type FunctionTupleWithoutConfig = [string, FunctionWithoutConfig]

/**
 * Finds functions for a list of paths using a specific runtime. The return
 * value is an object containing an array of the functions found (`functions`)
 * and an array with the paths that haven't been recognized by the runtime
 * (`remainingPaths`).
 */
const findFunctionsInRuntime = async function ({
  dedupe = false,
  featureFlags,
  fsCache,
  paths,
  runtime,
}: {
  dedupe: boolean
  featureFlags: FeatureFlags
  fsCache: FsCache
  paths: string[]
  runtime: Runtime
}) {
  const functions = await runtime.findFunctionsInPaths({ featureFlags, fsCache, paths })

  // If `dedupe` is true, we use the function name (`filename`) as the map key,
  // so that `function-1.js` will overwrite `function-1.go`. Otherwise, we use
  // `srcPath`, so that both functions are returned.
  const key = dedupe ? 'name' : 'srcPath'

  // Augmenting the function objects with additional information.
  const augmentedFunctions: FunctionTupleWithoutConfig[] = functions.map((func) => [
    func[key],
    {
      ...func,
      extension: extname(func.mainFile),
      filename: basename(func.srcPath),
      runtime,
    },
  ])
  const usedPaths = new Set(augmentedFunctions.map(([path]) => path))
  const remainingPaths = paths.filter((path) => !usedPaths.has(path))

  return { functions: augmentedFunctions, remainingPaths }
}

// An object to cache filesystem operations. This allows different functions
// to perform IO operations on the same file (i.e. getting its stats or its
// contents) without duplicating work.
const makeFsCache = (): FsCache => ({})

// The order of this array determines the priority of the runtimes. If a path
// is used by the first time, it won't be made available to the subsequent
// runtimes.
const RUNTIMES = [jsRuntime, goRuntime, rustRuntime]

/**
 * Gets a list of functions found in a list of paths.
 */
export const getFunctionsFromPaths = async (
  paths: string[],
  {
    config,
    configFileDirectories = [],
    dedupe = false,
    featureFlags = defaultFlags,
  }: { config?: Config; configFileDirectories?: string[]; dedupe?: boolean; featureFlags?: FeatureFlags } = {},
): Promise<FunctionMap> => {
  const fsCache = makeFsCache()

  // We cycle through the ordered array of runtimes, passing each one of them
  // through `findFunctionsInRuntime`. For each iteration, we collect all the
  // functions found plus the list of paths that still need to be evaluated,
  // using them as the input for the next iteration until the last runtime.
  const { functions } = await RUNTIMES.reduce(async (aggregate, runtime) => {
    const { functions: aggregateFunctions, remainingPaths: aggregatePaths } = await aggregate
    const { functions: runtimeFunctions, remainingPaths: runtimePaths } = await findFunctionsInRuntime({
      dedupe,
      featureFlags,
      fsCache,
      paths: aggregatePaths,
      runtime,
    })

    return {
      functions: [...aggregateFunctions, ...runtimeFunctions],
      remainingPaths: runtimePaths,
    }
  }, Promise.resolve({ functions: [], remainingPaths: paths } as { functions: FunctionTupleWithoutConfig[]; remainingPaths: string[] }))
  const functionConfigs = await Promise.all(
    functions.map(([, func]) => getConfigForFunction({ config, configFileDirectories, func, featureFlags })),
  )
  const functionsWithConfig: FunctionTuple[] = functions.map(([name, func], index) => [
    name,
    { ...func, config: functionConfigs[index] },
  ])

  return new Map(functionsWithConfig)
}

/**
 * Gets a list of functions found in a list of paths.
 */
export const getFunctionFromPath = async (
  path: string,
  { config, featureFlags = defaultFlags }: { config?: Config; featureFlags?: FeatureFlags } = {},
): Promise<FunctionSource | undefined> => {
  const fsCache = makeFsCache()

  for (const runtime of RUNTIMES) {
    const func = await runtime.findFunctionInPath({ path, fsCache, featureFlags })

    if (func) {
      const functionConfig = await getConfigForFunction({ config, func: { ...func, runtime }, featureFlags })

      return {
        ...func,
        runtime,
        config: functionConfig,
      }
    }
  }

  return undefined
}
