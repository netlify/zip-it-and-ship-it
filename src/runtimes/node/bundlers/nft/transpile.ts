import { build } from '@netlify/esbuild'

import type { FunctionConfig } from '../../../../config.js'
import type { RuntimeName } from '../../../runtime.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'
import type { NodeBundlerName } from '../index.js'

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
    const bundler: NodeBundlerName = 'nft'
    const runtime: RuntimeName = 'js'

    error.customErrorInfo = {
      type: 'functionsBundling',
      location: { bundler, functionName, runtime },
    }

    throw error
  }
}
