import { env } from 'process'

export const defaultFlags = {
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

  // Create unique entry file instead of a file that is based on the function name.
  zisi_unique_entry_file: false,

  // If multiple glob stars are in includedFiles, fail the build instead of warning.
  zisi_esbuild_fail_double_glob: false,

  // fixes symlinks in included files
  zisi_fix_symlinks: false,
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
