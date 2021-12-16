import { env } from 'process'

const FLAGS: Record<string, boolean> = {
  buildGoSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_GO_SOURCE),
  buildRustSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_RUST_SOURCE),
  defaultEsModulesToEsbuild: Boolean(env.NETLIFY_EXPERIMENTAL_DEFAULT_ES_MODULES_TO_ESBUILD),
  parseWithEsbuild: false,
  traceWithNft: false,
}

type FeatureFlag = keyof typeof FLAGS
type FeatureFlags = Record<FeatureFlag, boolean>

// List of supported flags and their default value.

const getFlags = (input: Record<string, boolean> = {}, flags = FLAGS) =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )

export { FLAGS as defaultFlags, getFlags }
export type { FeatureFlag, FeatureFlags }
