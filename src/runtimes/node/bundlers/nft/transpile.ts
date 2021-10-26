import { build } from '@netlify/esbuild'
import { tmpName } from 'tmp-promise'

import type { FunctionConfig } from '../../../../config'
import { safeUnlink } from '../../../../utils/fs'
import { getBundlerTarget } from '../esbuild/bundler_target'

const transpile = async (path: string, config: FunctionConfig) => {
  const targetPath = await tmpName({ postfix: '.js' })
  const cleanupFn = () => safeUnlink(targetPath)

  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  await build({
    bundle: false,
    entryPoints: [path],
    format: 'cjs',
    logLevel: 'error',
    outfile: targetPath,
    platform: 'node',
    target: [nodeTarget],
  })

  return {
    cleanupFn,
    path: targetPath,
  }
}

const transpileMany = async (paths: string[], config: FunctionConfig) => {
  const transpiledPaths: Map<string, string> = new Map()

  await Promise.all(
    paths.map(async (path) => {
      const transpiled = await transpile(path, config)

      transpiledPaths.set(transpiled.path, path)
    }),
  )

  return transpiledPaths
}

export { transpileMany }
