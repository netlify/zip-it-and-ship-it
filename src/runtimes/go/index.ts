import type { Stats } from 'fs'
import { basename, dirname, extname, join } from 'path'

import { copyFile } from 'cp-file'

import { SourceFile } from '../../function.js'
import type { RuntimeCache } from '../../utils/cache.js'
import { cachedLstat, cachedReaddir } from '../../utils/fs.js'
import getInternalValue from '../../utils/get_internal_value.js'
import { nonNullable } from '../../utils/non_nullable.js'
import { zipBinary } from '../../zip_binary.js'
import { detectBinaryRuntime } from '../detect_runtime.js'
import { FindFunctionInPathFunction, FindFunctionsInPathsFunction, Runtime, RUNTIME, ZipFunction } from '../runtime.js'

import { build } from './builder.js'

interface GoBinary {
  path: string
  stat: Stats
}

const detectGoFunction = async ({ cache, path }: { cache: RuntimeCache; path: string }) => {
  const stat = await cachedLstat(cache.lstatCache, path)

  if (!stat.isDirectory()) {
    return
  }

  const directoryName = basename(path)

  const files = await cachedReaddir(cache.readdirCache, path)
  const mainFileName = [`${directoryName}.go`, 'main.go'].find((name) => files.includes(name))

  if (mainFileName === undefined) {
    return
  }

  return mainFileName
}

const findFunctionsInPaths: FindFunctionsInPathsFunction = async function ({ cache, featureFlags, paths }) {
  const functions = await Promise.all(paths.map((path) => findFunctionInPath({ cache, featureFlags, path })))

  return functions.filter(nonNullable)
}

const findFunctionInPath: FindFunctionInPathFunction = async function ({ cache, path }) {
  const runtime = await detectBinaryRuntime({ path })

  if (runtime === RUNTIME.GO) {
    return processBinary({ cache, path })
  }

  const goSourceFile = await detectGoFunction({ cache, path })

  if (goSourceFile) {
    return processSource({ cache, mainFile: goSourceFile, path })
  }
}

const processBinary = async ({ cache, path }: { cache: RuntimeCache; path: string }): Promise<SourceFile> => {
  const stat = await cachedLstat(cache.lstatCache, path)
  const extension = extname(path)
  const filename = basename(path)
  const name = basename(path, extname(path))

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
  const extension = extname(mainFile)
  const name = basename(path, extname(path))

  return {
    extension,
    filename,
    mainFile: join(path, mainFile),
    name,
    srcDir: path,
    srcPath: path,
    stat,
  }
}

const zipFunction: ZipFunction = async function ({
  config,
  destFolder,
  filename,
  mainFile,
  srcDir,
  srcPath,
  stat,
  isInternal,
  featureFlags,
}) {
  const destPath = join(destFolder, filename)
  const isSource = extname(mainFile) === '.go'

  let binary: GoBinary = {
    path: srcPath,
    stat,
  }

  // If we're building a Go function from source, we call the build method and
  // update `binary` to point to the newly-created binary.
  if (isSource) {
    const { stat: binaryStat } = await build({ destPath, mainFile, srcDir })

    binary = {
      path: destPath,
      stat: binaryStat,
    }
  }

  // If `zipGo` is enabled, we create a zip archive with the Go binary and the
  // toolchain file.
  if (config.zipGo) {
    const zipPath = `${destPath}.zip`
    const zipOptions = {
      destPath: zipPath,
      filename: featureFlags.zisi_golang_use_al2 ? 'bootstrap' : basename(destPath),
      runtime,
    }

    await zipBinary({ ...zipOptions, srcPath: binary.path, stat: binary.stat })

    return {
      config,
      path: zipPath,
      entryFilename: zipOptions.filename,
      runtimeVersion: featureFlags.zisi_golang_use_al2 ? 'provided.al2' : undefined,
    }
  }

  // We don't need to zip the binary, so we can just copy it to the right path.
  // We do this only if we're not building from source, as otherwise the build
  // step already handled that.
  if (!isSource) {
    await copyFile(binary.path, destPath)
  }

  return {
    config,
    path: destPath,
    entryFilename: '',
    displayName: config?.name,
    generator: config?.generator || getInternalValue(isInternal),
  }
}

const runtime: Runtime = { findFunctionsInPaths, findFunctionInPath, name: RUNTIME.GO, zipFunction }

export default runtime
