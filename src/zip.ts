import { resolve } from 'path'

import makeDir from 'make-dir'
import pMap from 'p-map'

import { ArchiveFormat } from './archive'
import { Config } from './config'
import { FeatureFlags, getFlags } from './feature_flags'
import { FunctionSource } from './function'
import { createManifest } from './manifest'
import { getFunctionsFromPaths } from './runtimes'
import { addArchiveSize } from './utils/archive_size'
import { formatZipResult } from './utils/format_result'
import { listFunctionsDirectories, resolveFunctionsDirectories } from './utils/fs'
import { nonNullable } from './utils/non_nullable'

interface ZipFunctionOptions {
  archiveFormat?: ArchiveFormat
  basePath?: string
  config?: Config
  featureFlags?: FeatureFlags
  repositoryRoot?: string
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
const zipFunctions = async function (
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
  const [paths] = await Promise.all([listFunctionsDirectories(srcFolders), makeDir(destFolder)])
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
        filename: func.filename,
        mainFile: func.mainFile,
        name: func.name,
        repositoryRoot,
        runtime: func.runtime,
        srcDir: func.srcDir,
        srcPath: func.srcPath,
        stat: func.stat,
        featureFlags,
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

const zipFunction = async function (
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

  await makeDir(destFolder)

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

export { zipFunction, zipFunctions }
