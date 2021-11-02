import { build } from '@netlify/esbuild'

import type { FunctionConfig } from '../../../../config'
import { getBundlerTarget } from '../esbuild/bundler_target'

const transpile = async (path: string, config: FunctionConfig) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)
  const transpiled = await build({
    bundle: false,
    entryPoints: [path],
    format: 'cjs',
    logLevel: 'error',
    platform: 'node',
    target: [nodeTarget],
    write: false,
  })

  return transpiled.outputFiles[0].text
}

const transpileMany = async (paths: string[], config: FunctionConfig) => {
  const transpiledPaths: Map<string, string> = new Map()

  await Promise.all(
    paths.map(async (path) => {
      const transpiled = await transpile(path, config)

      transpiledPaths.set(path, transpiled)
    }),
  )

  return transpiledPaths
}

export { transpileMany }
