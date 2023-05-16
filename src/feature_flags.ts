import { env } from 'process'

export const defaultFlags = {
  // Build Rust functions from source.
  buildRustSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_RUST_SOURCE),

  // Use esbuild to trace dependencies in the legacy bundler.
  parseWithEsbuild: false,

  // Use NFT as the default bundler.
  traceWithNft: false,

  // Should Lambda functions inherit the build Node.js version
  functions_inherit_build_nodejs_version: false,

  // Output pure (i.e. untranspiled) ESM files when the function file has ESM
  // syntax and the parent `package.json` file has `{"type": "module"}`.
  zisi_pure_esm: false,

  // Output pure (i.e. untranspiled) ESM files when the function file has a
  // `.mjs` extension.
  zisi_pure_esm_mjs: false,

  // Output CJS file extension.
  zisi_output_cjs_extension: false,

  // Inject the compatibility layer required for the v2 runtime API to work.
  zisi_functions_api_v2: false,

  // Create unique entry file instead of a file that is based on the function name.
  zisi_unique_entry_file: false,

  // Uses the latest babel parser version
  zisi_use_latest_babel_version: false,
} as const

export type FeatureFlags = Partial<Record<keyof typeof defaultFlags, boolean>>

// List of supported flags and their default value.

export const getFlags = (input: Record<string, boolean> = {}, flags = defaultFlags): FeatureFlags =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )
