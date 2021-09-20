const { env } = require('process')

// List of supported flags and their default value.
const FLAGS = {
  buildGoSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_GO_SOURCE),
  buildRustSource: Boolean(env.NETLIFY_EXPERIMENTAL_BUILD_RUST_SOURCE),
  defaultEsModulesToEsbuild: Boolean(env.NETLIFY_EXPERIMENTAL_DEFAULT_ES_MODULES_TO_ESBUILD),
  parseWithEsbuild: false,
}

const getFlags = (input = {}, flags = FLAGS) =>
  Object.entries(flags).reduce(
    (result, [key, defaultValue]) => ({
      ...result,
      [key]: input[key] === undefined ? defaultValue : input[key],
    }),
    {},
  )

module.exports = { FLAGS, getFlags }
