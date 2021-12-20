import type { Stats } from 'fs'
import { basename, dirname, extname, join } from 'path'

import cpFile from 'cp-file'

import { SourceFile } from '../../function'
import { cachedLstat, cachedReaddir, FsCache } from '../../utils/fs'
import { nonNullable } from '../../utils/non_nullable'
import { detectBinaryRuntime } from '../detect_runtime'
import { FindFunctionInPathFunction, FindFunctionsInPathsFunction, Runtime, ZipFunction } from '../runtime'

import { build } from './builder'

const detectGoFunction = async ({ fsCache, path }: { fsCache: FsCache; path: string }) => {
  const stat = await cachedLstat(fsCache, path)

  if (!stat.isDirectory()) {
    return
  }

  const directoryName = basename(path)

  // @ts-expect-error TODO: The `makeCachedFunction` abstraction is causing the
  // return value of `readdir` to be incorrectly typed.
  const files = (await cachedReaddir(fsCache, path)) as string[]
  const mainFileName = [`${directoryName}.go`, 'main.go'].find((name) => files.includes(name))

  if (mainFileName === undefined) {
    return
  }

  return mainFileName
}

const findFunctionsInPaths: FindFunctionsInPathsFunction = async function ({ featureFlags, fsCache, paths }) {
  const functions = await Promise.all(paths.map((path) => findFunctionInPath({ featureFlags, fsCache, path })))

  return functions.filter(nonNullable)
}

const findFunctionInPath: FindFunctionInPathFunction = async function ({ featureFlags, fsCache, path }) {
  const runtime = await detectBinaryRuntime({ fsCache, path })

  if (runtime === 'go') {
    return processBinary({ fsCache, path })
  }

  if (featureFlags.buildGoSource !== true) {
    return
  }

  const goSourceFile = await detectGoFunction({ fsCache, path })

  if (goSourceFile) {
    return processSource({ fsCache, mainFile: goSourceFile, path })
  }
}

const processBinary = async ({ fsCache, path }: { fsCache: FsCache; path: string }): Promise<SourceFile> => {
  const stat = (await cachedLstat(fsCache, path)) as Stats
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

const zipFunction: ZipFunction = async function ({ config, destFolder, filename, mainFile, srcDir, srcPath }) {
  const destPath = join(destFolder, filename)
  const isSource = extname(mainFile) === '.go'

  // If we're building a Go function from source, we call the build method and
  // it'll take care of placing the binary in the right location. If not, we
  // need to copy the existing binary file to the destination directory.
  await (isSource ? build({ destPath, mainFile, srcDir }) : cpFile(srcPath, destPath))

  return { config, path: destPath }
}

const runtime: Runtime = { findFunctionsInPaths, findFunctionInPath, name: 'go', zipFunction }

export default runtime
