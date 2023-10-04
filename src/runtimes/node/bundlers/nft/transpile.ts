import { build, BuildOptions } from 'esbuild'

import type { FunctionConfig } from '../../../../config.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { RUNTIME } from '../../../runtime.js'
import { ModuleFormat, MODULE_FORMAT } from '../../utils/module_format.js'
import rewriteImportsPlugin from '../../utils/plugin_rewrite_imports.js'
import type { TsConfig } from '../../utils/tsconfig.js'
import { getBundlerTarget } from '../esbuild/bundler_target.js'
import { NODE_BUNDLER } from '../types.js'

interface TranspileESMToCJSOptions {
  config: FunctionConfig
  name: string
  path: string
  tsConfig?: TsConfig
}

export const transpileESMToCJS = async ({ config, name, path, tsConfig }: TranspileESMToCJSOptions) => {
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
      tsconfigRaw: tsConfig ? JSON.stringify(tsConfig) : undefined,
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
  config: FunctionConfig
  format?: ModuleFormat
  name: string
  path: string
  rewriteImportPaths?: boolean
}

export const transpileTS = async ({ config, format, name, path, rewriteImportPaths = false }: TranspileTSOptions) => {
  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  const rewriteOptions: BuildOptions = rewriteImportPaths
    ? { bundle: true, packages: 'external', plugins: [rewriteImportsPlugin] }
    : { bundle: false }

  try {
    const transpiled = await build({
      ...rewriteOptions,
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
