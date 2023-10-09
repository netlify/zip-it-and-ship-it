import { resolve } from 'path'

import { build, BuildOptions } from 'esbuild'

import type { FunctionConfig } from '../../../../config.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { RUNTIME } from '../../../runtime.js'
import { CJS_SHIM } from '../../utils/esm_cjs_compat.js'
import { ModuleFormat, MODULE_FORMAT } from '../../utils/module_format.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'
import { NODE_BUNDLER } from '../types.js'

interface TranspileESMToCJSOptions {
  config: FunctionConfig
  name: string
  path: string
}

export const transpileESMToCJS = async ({ config, name, path }: TranspileESMToCJSOptions) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  try {
    const transpiled = await build({
      bundle: false,
      entryPoints: [path],
      format: MODULE_FORMAT.COMMONJS,
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

interface TranspileTSOptions {
  bundle?: boolean
  config: FunctionConfig
  format?: ModuleFormat
  name: string
  path: string
}

export const transpileTS = async ({ bundle = false, config, format, name, path }: TranspileTSOptions) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)
  const bundleOptions: BuildOptions = {
    bundle: false,
  }

  if (bundle) {
    bundleOptions.bundle = true
    bundleOptions.packages = 'external'

    if (format === MODULE_FORMAT.ESM) {
      bundleOptions.banner = { js: CJS_SHIM }
    }
  }

  try {
    const transpiled = await build({
      ...bundleOptions,
      entryPoints: [path],
      format,
      logLevel: 'error',
      metafile: true,
      platform: 'node',
      sourcemap: Boolean(config.nodeSourcemap),
      target: [nodeTarget],
      write: false,
    })
    const bundledPaths = bundle ? Object.keys(transpiled.metafile.inputs).map((inputPath) => resolve(inputPath)) : []

    return { bundledPaths, transpiled: transpiled.outputFiles[0].text }
  } catch (error) {
    throw FunctionBundlingUserError.addCustomErrorInfo(error, {
      functionName: name,
      runtime: RUNTIME.JAVASCRIPT,
      bundler: NODE_BUNDLER.NFT,
    })
  }
}
