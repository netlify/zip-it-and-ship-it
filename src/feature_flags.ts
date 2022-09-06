import { env } from 'process'

export const defaultFlags: Record<string, boolean> = {
  // Build Rust functions from source.
  buildRustSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_RUST_SOURCE),

  // Use esbuild to trace dependencies in the legacy bundler.
  parseWithEsbuild: false,

  // Use NFT as the default bundler.
  traceWithNft: false,

  // Output pure (i.e. untranspiled) ESM files when the function file has ESM
  // syntax and the parent `package.json` file has `{"type": "module"}`.
  zisi_pure_esm: false,

  // Output pure (i.e. untranspiled) ESM files when the function file has a
  // `.mjs` extension.
  zisi_pure_esm_mjs: false,

  // Load configuration from per-function JSON files.
  project_deploy_configuration_api_use_per_function_configuration_files: false,
}

export type FeatureFlag = keyof typeof defaultFlags
export type FeatureFlags = Record<FeatureFlag, boolean>

// List of supported flags and their default value.

export const getFlags = (input: Record<string, boolean> = {}, flags = defaultFlags): FeatureFlags =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )
