import type { Stats } from 'fs'
import { join, extname, dirname, basename } from 'path'

import { FeatureFlags } from '../../feature_flags.js'
import { SourceFile } from '../../function.js'
import type { RuntimeCache } from '../../utils/cache.js'
import { cachedLstat, cachedReaddir } from '../../utils/fs.js'
import getInternalValue from '../../utils/get_internal_value.js'
import { nonNullable } from '../../utils/non_nullable.js'
import { zipBinary } from '../../zip_binary.js'
import { detectBinaryRuntime } from '../detect_runtime.js'
import { FindFunctionsInPathsFunction, FindFunctionInPathFunction, Runtime, ZipFunction, RUNTIME } from '../runtime.js'

import { build } from './builder.js'
import { MANIFEST_NAME } from './constants.js'

const detectRustFunction = async ({ cache, path }: { cache: RuntimeCache; path: string }) => {
  const stat = await cachedLstat(cache.lstatCache, path)

  if (!stat.isDirectory()) {
    return
  }

  const files = await cachedReaddir(cache.readdirCache, path)
  const hasCargoManifest = files.includes(MANIFEST_NAME)

  if (!hasCargoManifest) {
    return
  }

  const mainFilePath = join(path, 'src', 'main.rs')

  try {
    const mainFile = await cachedLstat(cache.lstatCache, mainFilePath)

    if (mainFile.isFile()) {
      return mainFilePath
    }
  } catch {
    // no-op
  }
}

const findFunctionsInPaths: FindFunctionsInPathsFunction = async function ({
  cache,
  featureFlags,
  paths,
}: {
  cache: RuntimeCache
  featureFlags: FeatureFlags
  paths: string[]
}) {
  const functions = await Promise.all(paths.map((path) => findFunctionInPath({ cache, featureFlags, path })))

  return functions.filter(nonNullable)
}

const findFunctionInPath: FindFunctionInPathFunction = async function ({ cache, featureFlags, path }) {
  const runtime = await detectBinaryRuntime({ path })

  if (runtime === RUNTIME.RUST) {
    return processBinary({ cache, path })
  }

  if (featureFlags.buildRustSource !== true) {
    return
  }

  const rustSourceFile = await detectRustFunction({ cache, path })

  if (rustSourceFile) {
    return processSource({ cache, mainFile: rustSourceFile, path })
  }
}

const processBinary = async ({ cache, path }: { cache: RuntimeCache; path: string }): Promise<SourceFile> => {
  const stat = (await cachedLstat(cache.lstatCache, path)) as Stats
  const filename = basename(path)
  const extension = extname(path)
  const name = basename(path, extension)

  return {
    extension,
    filename,
    mainFile: path,
    name,
    srcDir: dirname(path),
    srcPath: path,
    stat,
  }
}

const processSource = async ({
  cache,
  mainFile,
  path,
}: {
  cache: RuntimeCache
  mainFile: string
  path: string
}): Promise<SourceFile> => {
  // TODO: This `stat` value is not going to be used, but we need it to satisfy
  // the `FunctionSource` interface. We should revisit whether `stat` should be
  // part of that interface in the first place, or whether we could compute it
  // downstream when needed (maybe using the FS cache as an optimisation).
  const stat = (await cachedLstat(cache.lstatCache, path)) as Stats
  const filename = basename(path)
  const extension = extname(path)
  const name = basename(path, extension)

  return {
    extension,
    filename,
    mainFile,
    name,
    srcDir: path,
    srcPath: path,
    stat,
  }
}

// The name of the binary inside the zip file must always be `bootstrap`
// because they include the Lambda runtime, and that's the name that AWS
// expects for those kind of functions.
const zipFunction: ZipFunction = async function ({
  cache,
  config,
  destFolder,
  filename,
  mainFile,
  runtime,
  srcDir,
  srcPath,
  stat,
  isInternal,
}) {
  const destPath = join(destFolder, `${filename}.zip`)
  const isSource = extname(mainFile) === '.rs'
  const zipOptions = {
    destPath,
    filename: 'bootstrap',
    runtime,
  }

  // If we're building from source, we first need to build the source and zip
  // the resulting binary. Otherwise, we're dealing with a binary so we zip it
  // directly.
  if (isSource) {
    const { path: binaryPath, stat: binaryStat } = await build({ cache, config, name: filename, srcDir })

    await zipBinary({ ...zipOptions, srcPath: binaryPath, stat: binaryStat })
  } else {
    await zipBinary({ ...zipOptions, srcPath, stat })
  }

  return {
    config,
    path: destPath,
    entryFilename: '',
    displayName: config?.name,
    generator: config?.generator || getInternalValue(isInternal),
  }
}

const runtime: Runtime = { findFunctionsInPaths, findFunctionInPath, name: RUNTIME.RUST, zipFunction }

export default runtime
