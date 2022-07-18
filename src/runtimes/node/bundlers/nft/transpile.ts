import { build } from '@netlify/esbuild'

import type { FunctionConfig } from '../../../../config.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'

export const transpile = async (path: string, config: FunctionConfig, functionName: string) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  try {
    const transpiled = await build({
      bundle: false,
      entryPoints: [path],
      format: 'cjs',
      logLevel: 'error',
      platform: 'node',
      sourcemap: Boolean(config.nodeSourcemap),
      target: [nodeTarget],
      write: false,
    })

    return transpiled.outputFiles[0].text
  } catch (error) {
    throw new FunctionBundlingUserError(error, { functionName, runtime: 'js', bundler: 'nft' })
  }
}
