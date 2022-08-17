import { build } from '@netlify/esbuild'

import type { FunctionConfig } from '../../../../config.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { RuntimeType } from '../../../runtime.js'
import { ModuleFormat } from '../../utils/module_format.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'
import { NodeBundlerType } from '../types.js'

export const transpile = async (path: string, config: FunctionConfig, functionName: string) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  try {
    const transpiled = await build({
      bundle: false,
      entryPoints: [path],
      format: ModuleFormat.COMMONJS,
      logLevel: 'error',
      platform: 'node',
      sourcemap: Boolean(config.nodeSourcemap),
      target: [nodeTarget],
      write: false,
    })

    return transpiled.outputFiles[0].text
  } catch (error) {
    throw FunctionBundlingUserError.addCustomErrorInfo(error, {
      functionName,
      runtime: RuntimeType.JAVASCRIPT,
      bundler: NodeBundlerType.NFT,
    })
  }
}
