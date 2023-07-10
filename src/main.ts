import { extname } from 'path'

import { Config } from './config.js'
import { FeatureFlags, getFlags } from './feature_flags.js'
import { FunctionSource } from './function.js'
import { getFunctionFromPath, getFunctionsFromPaths } from './runtimes/index.js'
import { findISCDeclarationsInPath, ISCValues } from './runtimes/node/in_source_config/index.js'
import { GetSrcFilesFunction, RuntimeName, RUNTIME } from './runtimes/runtime.js'
import { RuntimeCache } from './utils/cache.js'
import { listFunctionsDirectories, resolveFunctionsDirectories } from './utils/fs.js'
import { getLogger } from './utils/logger.js'

export { Config, FunctionConfig } from './config.js'
export { zipFunction, zipFunctions, ZipFunctionOptions, ZipFunctionsOptions } from './zip.js'

export { ArchiveFormat, ARCHIVE_FORMAT } from './archive.js'
export { NodeBundlerName, NODE_BUNDLER } from './runtimes/node/bundlers/types.js'
export { RuntimeName, RUNTIME } from './runtimes/runtime.js'
export { ModuleFormat, MODULE_FORMAT } from './runtimes/node/utils/module_format.js'

export interface ListedFunction {
  name: string
  mainFile: string
  runtime: RuntimeName
  extension: string
  runtimeAPIVersion?: number
  schedule?: string
  displayName?: string
  generator?: string
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

const augmentWithISC = async (func: FunctionSource, featureFlags: FeatureFlags): Promise<AugmentedFunctionSource> => {
  // ISC is currently only supported in JavaScript and TypeScript functions
  // and only supports scheduled functions.
  if (func.runtime.name !== RUNTIME.JAVASCRIPT) {
    return func
  }

  const inSourceConfig = await findISCDeclarationsInPath(func.mainFile, {
    functionName: func.name,
    featureFlags,
    logger: getLogger(),
  })

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
  const augmentedFunctions = parseISC
    ? await Promise.all(functions.map((func) => augmentWithISC(func, featureFlags)))
    : functions

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

  const augmentedFunction = parseISC ? await augmentWithISC(func, featureFlags) : func

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
): Promise<ListedFunctionFile[]> {
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const paths = await listFunctionsDirectories(srcFolders)
  const cache = new RuntimeCache()
  const functionsMap = await getFunctionsFromPaths(paths, { cache, config, configFileDirectories, featureFlags })
  const functions = [...functionsMap.values()]
  const augmentedFunctions = parseISC
    ? await Promise.all(functions.map((func) => augmentWithISC(func, featureFlags)))
    : functions
  const listedFunctionsFiles = await Promise.all(
    augmentedFunctions.map((func) => getListedFunctionFiles(func, { basePath, featureFlags })),
  )

  return listedFunctionsFiles.flat()
}

const getListedFunction = function ({
  config,
  extension,
  inSourceConfig,
  mainFile,
  name,
  runtime,
}: AugmentedFunctionSource): ListedFunction {
  return {
    displayName: config.name,
    extension,
    generator: config.generator,
    mainFile,
    name,
    runtime: runtime.name,
    runtimeAPIVersion: inSourceConfig ? inSourceConfig?.runtimeAPIVersion ?? 1 : undefined,
    schedule: inSourceConfig?.schedule ?? config.schedule,
  }
}

const getListedFunctionFiles = async function (
  func: AugmentedFunctionSource,
  options: { basePath?: string; featureFlags: FeatureFlags },
): Promise<ListedFunctionFile[]> {
  const srcFiles = await getSrcFiles({
    ...func,
    ...options,
    runtimeAPIVersion: func.inSourceConfig?.runtimeAPIVersion ?? 1,
  })

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
