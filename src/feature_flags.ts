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

  // Output CJS file extension.
  zisi_output_cjs_extension: false,

  // Do not allow ___netlify-entry-point as function or file name.
  zisi_disallow_new_entry_name: false,

  // Inject the compatibility layer required for the v2 runtime API to work.
  zisi_functions_api_v2: false,
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
