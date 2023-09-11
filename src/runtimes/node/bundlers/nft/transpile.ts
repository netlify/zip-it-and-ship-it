import { build } from 'esbuild'

import type { FunctionConfig } from '../../../../config.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { RUNTIME } from '../../../runtime.js'
import { ModuleFormat } from '../../utils/module_format.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'
import { NODE_BUNDLER } from '../types.js'

interface TranspileOptions {
  config: FunctionConfig
  format?: ModuleFormat
  name: string
  path: string
}

export const transpile = async ({ config, format, name, path }: TranspileOptions) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  try {
    const transpiled = await build({
      bundle: false,
      entryPoints: [path],
      format,
      logLevel: 'error',
      platform: 'node',
      sourcemap: Boolean(config.nodeSourcemap),
      target: [nodeTarget],
      write: false,
    })

    return transpiled.outputFiles[0].text
  } catch (error) {
    throw FunctionBundlingUserError.addCustomErrorInfo(error, {
      functionName: name,
      runtime: RUNTIME.JAVASCRIPT,
      bundler: NODE_BUNDLER.NFT,
    })
  }
}
