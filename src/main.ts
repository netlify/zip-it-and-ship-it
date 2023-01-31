import { extname } from 'path'

import { Config } from './config.js'
import { FeatureFlags, getFlags } from './feature_flags.js'
import { FunctionSource } from './function.js'
import { getFunctionFromPath, getFunctionsFromPaths } from './runtimes/index.js'
import { findISCDeclarationsInPath, ISCValues } from './runtimes/node/in_source_config/index.js'
import { GetSrcFilesFunction, RuntimeType } from './runtimes/runtime.js'
import { RuntimeCache } from './utils/cache.js'
import { listFunctionsDirectories, resolveFunctionsDirectories } from './utils/fs.js'

export { zipFunction, zipFunctions } from './zip.js'

export { NodeBundlerType } from './runtimes/node/bundlers/types.js'
export { RuntimeType } from './runtimes/runtime.js'
export { ModuleFormat } from './runtimes/node/utils/module_format.js'

export interface ListedFunction {
  name: string
  mainFile: string
  runtime: RuntimeType
  extension: string
  schedule?: string
  displayName?: string
}

type ListedFunctionFile = ListedFunction & {
  srcFile: string
}

interface ListFunctionsOptions {
  basePath?: string
  config?: Config
  configFileDirectories?: string[]
  featureFlags?: FeatureFlags
  parseISC?: boolean
}

interface AugmentedFunctionSource extends FunctionSource {
  inSourceConfig?: ISCValues
}

const augmentWithISC = async (func: FunctionSource): Promise<AugmentedFunctionSource> => {
  // ISC is currently only supported in JavaScript and TypeScript functions
  // and only supports scheduled functions.
  if (func.runtime.name !== RuntimeType.JAVASCRIPT) {
    return func
  }

  const inSourceConfig = await findISCDeclarationsInPath(func.mainFile, func.name)

  return { ...func, inSourceConfig }
}

// List all Netlify Functions main entry files for a specific directory
export const listFunctions = async function (
  relativeSrcFolders: string | string[],
  {
    featureFlags: inputFeatureFlags,
    config,
    configFileDirectories,
    parseISC = false,
  }: { featureFlags?: FeatureFlags; config?: Config; configFileDirectories?: string[]; parseISC?: boolean } = {},
) {
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const paths = await listFunctionsDirectories(srcFolders)
  const cache = new RuntimeCache()
  const functionsMap = await getFunctionsFromPaths(paths, { cache, config, configFileDirectories, featureFlags })
  const functions = [...functionsMap.values()]
  const augmentedFunctions = parseISC ? await Promise.all(functions.map(augmentWithISC)) : functions

  return augmentedFunctions.map(getListedFunction)
}

// Finds a function at a specific path.
export const listFunction = async function (
  path: string,
  {
    featureFlags: inputFeatureFlags,
    config,
    configFileDirectories,
    parseISC = false,
  }: { featureFlags?: FeatureFlags; config?: Config; configFileDirectories?: string[]; parseISC?: boolean } = {},
) {
  const featureFlags = getFlags(inputFeatureFlags)
  const cache = new RuntimeCache()
  const func = await getFunctionFromPath(path, { cache, config, configFileDirectories, featureFlags })

  if (!func) {
    return
  }

  const augmentedFunction = parseISC ? await augmentWithISC(func) : func

  return getListedFunction(augmentedFunction)
}

// List all Netlify Functions files for a specific directory
export const listFunctionsFiles = async function (
  relativeSrcFolders: string | string[],
  {
    basePath,
    config,
    configFileDirectories,
    featureFlags: inputFeatureFlags,
    parseISC = false,
  }: ListFunctionsOptions = {},
) {
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const paths = await listFunctionsDirectories(srcFolders)
  const cache = new RuntimeCache()
  const functionsMap = await getFunctionsFromPaths(paths, { cache, config, configFileDirectories, featureFlags })
  const functions = [...functionsMap.values()]
  const augmentedFunctions = parseISC ? await Promise.all(functions.map(augmentWithISC)) : functions
  const listedFunctionsFiles = await Promise.all(
    augmentedFunctions.map((func) => getListedFunctionFiles(func, { basePath, featureFlags })),
  )

  return listedFunctionsFiles.flat()
}

const getListedFunction = function ({
  runtime,
  name,
  mainFile,
  extension,
  config,
  inSourceConfig,
}: AugmentedFunctionSource): ListedFunction {
  return {
    name,
    displayName: config.name,
    mainFile,
    runtime: runtime.name,
    extension,
    schedule: inSourceConfig?.schedule ?? config.schedule,
  }
}

const getListedFunctionFiles = async function (
  func: AugmentedFunctionSource,
  options: { basePath?: string; featureFlags: FeatureFlags },
): Promise<ListedFunctionFile[]> {
  const srcFiles = await getSrcFiles({ ...func, ...options })

  return srcFiles.map((srcFile) => ({ ...getListedFunction(func), srcFile, extension: extname(srcFile) }))
}

const getSrcFiles: GetSrcFilesFunction = async function ({ extension, runtime, srcPath, ...args }) {
  const { getSrcFiles: getRuntimeSrcFiles } = runtime

  if (extension === '.zip' || typeof getRuntimeSrcFiles !== 'function') {
    return [srcPath]
  }

  return await getRuntimeSrcFiles({
    extension,
    runtime,
    srcPath,
    ...args,
  })
}
