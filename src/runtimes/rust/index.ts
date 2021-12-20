import type { Stats } from 'fs'
import { join, extname, dirname, basename } from 'path'

import { FeatureFlags } from '../../feature_flags'
import { SourceFile } from '../../function'
import { cachedLstat, cachedReaddir, FsCache } from '../../utils/fs'
import { nonNullable } from '../../utils/non_nullable'
import { zipBinary } from '../../zip_binary'
import { detectBinaryRuntime } from '../detect_runtime'
import { FindFunctionsInPathsFunction, FindFunctionInPathFunction, Runtime, ZipFunction } from '../runtime'

import { build } from './builder'
import { MANIFEST_NAME } from './constants'

const detectRustFunction = async ({ fsCache, path }: { fsCache: FsCache; path: string }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return
  }

  // @ts-expect-error TODO: The `makeCachedFunction` abstraction is causing the
  // return value of `readdir` to be incorrectly typed.
  const files = (await cachedReaddir(fsCache, path)) as string[]
  const hasCargoManifest = files.includes(MANIFEST_NAME)

  if (!hasCargoManifest) {
    return
  }

  const mainFilePath = join(path, 'src', 'main.rs')

  try {
    const mainFile = await cachedLstat(fsCache, mainFilePath)

    if (mainFile.isFile()) {
      return mainFilePath
    }
  } catch (_) {
    // no-op
  }
}

const findFunctionsInPaths: FindFunctionsInPathsFunction = async function ({
  featureFlags,
  fsCache,
  paths,
}: {
  featureFlags: FeatureFlags
  fsCache: FsCache
  paths: string[]
}) {
  const functions = await Promise.all(paths.map((path) => findFunctionInPath({ path, featureFlags, fsCache })))

  return functions.filter(nonNullable)
}

const findFunctionInPath: FindFunctionInPathFunction = async function ({ path, featureFlags, fsCache }) {
  const runtime = await detectBinaryRuntime({ fsCache, path })

  if (runtime === 'rs') {
    return processBinary({ fsCache, path })
  }

  if (featureFlags.buildRustSource !== true) {
    return
  }

  const rustSourceFile = await detectRustFunction({ fsCache, path })

  if (rustSourceFile) {
    return processSource({ fsCache, mainFile: rustSourceFile, path })
  }
}

const processBinary = async ({ fsCache, path }: { fsCache: FsCache; path: string }): Promise<SourceFile> => {
  const stat = (await cachedLstat(fsCache, path)) as Stats
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
  fsCache,
  mainFile,
  path,
}: {
  fsCache: FsCache
  mainFile: string
  path: string
}): Promise<SourceFile> => {
  // TODO: This `stat` value is not going to be used, but we need it to satisfy
  // the `FunctionSource` interface. We should revisit whether `stat` should be
  // part of that interface in the first place, or whether we could compute it
  // downstream when needed (maybe using the FS cache as an optimisation).
  const stat = (await cachedLstat(fsCache, path)) as Stats
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
  config,
  destFolder,
  filename,
  mainFile,
  runtime,
  srcDir,
  srcPath,
  stat,
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
    const { path: binaryPath, stat: binaryStat } = await build({ config, name: filename, srcDir })

    await zipBinary({ ...zipOptions, srcPath: binaryPath, stat: binaryStat })
  } else {
    await zipBinary({ ...zipOptions, srcPath, stat })
  }

  return { config, path: destPath }
}

const runtime: Runtime = { findFunctionsInPaths, findFunctionInPath, name: 'rs', zipFunction }

export default runtime
