import { promises as fs } from 'fs'
import { resolve } from 'path'

import pMap from 'p-map'

import { ArchiveFormat } from './archive.js'
import { Config } from './config.js'
import { FeatureFlags, getFlags } from './feature_flags.js'
import { FunctionSource } from './function.js'
import { createManifest } from './manifest.js'
import { getFunctionsFromPaths } from './runtimes/index.js'
import { ModuleFormat } from './runtimes/node/utils/module_format.js'
import { addArchiveSize } from './utils/archive_size.js'
import { formatZipResult } from './utils/format_result.js'
import { listFunctionsDirectories, resolveFunctionsDirectories } from './utils/fs.js'
import { getLogger, LogFunction } from './utils/logger.js'
import { nonNullable } from './utils/non_nullable.js'
import { endTimer, roundTimerToMillisecs, startTimer } from './utils/timer.js'

interface ZipFunctionOptions {
  archiveFormat?: ArchiveFormat
  basePath?: string
  config?: Config
  featureFlags?: FeatureFlags
  repositoryRoot?: string
  zipGo?: boolean
  systemLog?: LogFunction
  debug?: boolean
}

export type ZipFunctionsOptions = ZipFunctionOptions & {
  configFileDirectories?: string[]
  manifest?: string
  parallelLimit?: number
}

const DEFAULT_PARALLEL_LIMIT = 5

// TODO: now that we have types, do we still need runtime validation?
const validateArchiveFormat = (archiveFormat: ArchiveFormat) => {
  if (!['none', 'zip'].includes(archiveFormat)) {
    throw new Error(`Invalid archive format: ${archiveFormat}`)
  }
}

// Zip `srcFolder/*` (Node.js or Go files) to `destFolder/*.zip` so it can be
// used by AWS Lambda
export const zipFunctions = async function (
  relativeSrcFolders: string | string[],
  destFolder: string,
  {
    archiveFormat = 'zip',
    basePath,
    config = {},
    configFileDirectories,
    featureFlags: inputFeatureFlags,
    manifest,
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
    repositoryRoot = basePath,
    systemLog,
    debug,
  }: ZipFunctionsOptions = {},
) {
  validateArchiveFormat(archiveFormat)

  const logger = getLogger(systemLog, debug)
  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const [paths] = await Promise.all([listFunctionsDirectories(srcFolders), fs.mkdir(destFolder, { recursive: true })])
  const functions = await getFunctionsFromPaths(paths, { config, configFileDirectories, dedupe: true, featureFlags })
  const results = await pMap(
    functions.values(),
    async (func) => {
      const functionFlags = {
        ...featureFlags,

        // If there's a `nodeModuleFormat` configuration property set to `esm`,
        // extend the feature flags with `zisi_pure_esm_mjs` enabled.
        ...(func.config.nodeModuleFormat === ModuleFormat.ESM ? { zisi_pure_esm_mjs: true } : {}),
      }

      const startIntervalTime = startTimer()
      const zipResult = await func.runtime.zipFunction({
        archiveFormat,
        basePath,
        config: func.config,
        destFolder,
        extension: func.extension,
        featureFlags: functionFlags,
        filename: func.filename,
        mainFile: func.mainFile,
        name: func.name,
        repositoryRoot,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
      })
      const durationNs = endTimer(startIntervalTime)
      const durationMs = roundTimerToMillisecs(durationNs)
      const logObject = {
        name: func.name,
        config: func.config,
        featureFlags: functionFlags,
        durationMs
      }

      logger.system(`Function details: ${JSON.stringify(logObject, null, 2)}`)

      return { ...zipResult, mainFile: func.mainFile, name: func.name, runtime: func.runtime }
    },
    {
      concurrency: parallelLimit,
    },
  )
  const formattedResults = await Promise.all(
    results.filter(nonNullable).map(async (result) => {
      const resultWithSize = await addArchiveSize(result)

      return formatZipResult(resultWithSize)
    }),
  )

  if (manifest !== undefined) {
    await createManifest({ functions: formattedResults, path: resolve(manifest) })
  }

  return formattedResults
}

// eslint-disable-next-line max-statements
export const zipFunction = async function (
  relativeSrcPath: string,
  destFolder: string,
  {
    archiveFormat = 'zip',
    basePath,
    config: inputConfig = {},
    featureFlags: inputFeatureFlags,
    repositoryRoot = basePath,
    systemLog,
    debug,
  }: ZipFunctionOptions = {},
) {
  validateArchiveFormat(archiveFormat)

  const logger = getLogger(systemLog, debug)
  const featureFlags = getFlags(inputFeatureFlags)
  const srcPath = resolve(relativeSrcPath)
  const functions = await getFunctionsFromPaths([srcPath], { config: inputConfig, dedupe: true, featureFlags })

  if (functions.size === 0) {
    return
  }

  const {
    config,
    extension,
    filename,
    mainFile,
    name,
    runtime,
    srcDir,
    stat: stats,
  }: FunctionSource = functions.values().next().value

  await fs.mkdir(destFolder, { recursive: true })

  const functionFlags = {
    ...featureFlags,

    // If there's a `nodeModuleFormat` configuration property set to `esm`,
    // extend the feature flags with `zisi_pure_esm_mjs` enabled.
    ...(config.nodeModuleFormat === ModuleFormat.ESM ? { zisi_pure_esm_mjs: true } : {}),
  }
  const startIntervalTime = startTimer()
  const zipResult = await runtime.zipFunction({
    archiveFormat,
    basePath,
    config,
    destFolder,
    extension,
    featureFlags: functionFlags,
    filename,
    mainFile,
    name,
    repositoryRoot,
    runtime,
    srcDir,
    srcPath,
    stat: stats,
  })
  const durationNs = endTimer(startIntervalTime)
  const durationMs = roundTimerToMillisecs(durationNs)
  const logObject = {
    name,
    config,
    featureFlags: functionFlags,
    durationMs,
  }

  logger.system(`Function details: ${JSON.stringify(logObject, null, 2)}`)

  return formatZipResult({ ...zipResult, mainFile, name, runtime })
}
