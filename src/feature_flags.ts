import { env } from 'process'

export const defaultFlags: Record<string, boolean> = {
  buildRustSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_RUST_SOURCE),
  parseWithEsbuild: false,
  traceWithNft: false,
  zisi_pure_esm: false,
  project_deploy_configuration_api_use_per_function_configuration_files: false,
}

export type FeatureFlag = keyof typeof defaultFlags
export type FeatureFlags = Record<FeatureFlag, boolean>

// List of supported flags and their default value.

export const getFlags = (input: Record<string, boolean> = {}, flags = defaultFlags) =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )
