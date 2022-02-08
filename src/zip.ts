import { promises as fs } from 'fs'
import { resolve } from 'path'

import pMap from 'p-map'

import { ArchiveFormat } from './archive.js'
import { Config } from './config.js'
import { FeatureFlags, getFlags } from './feature_flags.js'
import { FunctionSource } from './function.js'
import { createManifest } from './manifest.js'
import { getFunctionsFromPaths } from './runtimes/index.js'
import { addArchiveSize } from './utils/archive_size.js'
import { formatZipResult } from './utils/format_result.js'
import { listFunctionsDirectories, resolveFunctionsDirectories } from './utils/fs.js'
import { nonNullable } from './utils/non_nullable.js'

interface ZipFunctionOptions {
  archiveFormat?: ArchiveFormat
  basePath?: string
  config?: Config
  featureFlags?: FeatureFlags
  repositoryRoot?: string
  zipGo?: boolean
}

type ZipFunctionsOptions = ZipFunctionOptions & {
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
    featureFlags: inputFeatureFlags,
    manifest,
    parallelLimit = DEFAULT_PARALLEL_LIMIT,
    repositoryRoot = basePath,
  }: ZipFunctionsOptions = {},
) {
  validateArchiveFormat(archiveFormat)

  const featureFlags = getFlags(inputFeatureFlags)
  const srcFolders = resolveFunctionsDirectories(relativeSrcFolders)
  const [paths] = await Promise.all([listFunctionsDirectories(srcFolders), fs.mkdir(destFolder, { recursive: true })])
  const functions = await getFunctionsFromPaths(paths, { config, dedupe: true, featureFlags })
  const results = await pMap(
    functions.values(),
    async (func) => {
      const zipResult = await func.runtime.zipFunction({
        archiveFormat,
        basePath,
        config: func.config,
        destFolder,
        extension: func.extension,
        featureFlags,
        filename: func.filename,
        mainFile: func.mainFile,
        name: func.name,
        repositoryRoot,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
      })

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

export const zipFunction = async function (
  relativeSrcPath: string,
  destFolder: string,
  {
    archiveFormat = 'zip',
    basePath,
    config: inputConfig = {},
    featureFlags: inputFeatureFlags,
    repositoryRoot = basePath,
  }: ZipFunctionOptions = {},
) {
  validateArchiveFormat(archiveFormat)

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

  const zipResult = await runtime.zipFunction({
    archiveFormat,
    basePath,
    config,
    destFolder,
    extension,
    featureFlags,
    filename,
    mainFile,
    name,
    repositoryRoot,
    runtime,
    srcDir,
    srcPath,
    stat: stats,
  })

  return formatZipResult({ ...zipResult, mainFile, name, runtime })
}
