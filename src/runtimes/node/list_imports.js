const esbuild = require('@netlify/esbuild')
const isBuiltinModule = require('is-builtin-module')
const { tmpName } = require('tmp-promise')

const { JS_BUNDLER_ZISI, RUNTIME_JS } = require('../../utils/consts')
const { safeUnlink } = require('../../utils/fs')

// Maximum number of log messages that an esbuild instance will produce. This
// limit is important to avoid out-of-memory errors due to too much data being
// sent in the Go<>Node IPC channel.
const ESBUILD_LOG_LIMIT = 10

const getListImportsPlugin = ({ imports, path }) => ({
  name: 'list-imports',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const isEntryPoint = args.path === path
      const isImport = !isEntryPoint && !isBuiltinModule(args.path)

      if (isImport) {
        imports.add(args.path)
      }

      return {
        namespace: 'list-imports',
        external: isImport,
      }
    })
  },
})

const listImports = async ({ functionName, path }) => {
  // We're not interested in the output that esbuild generates, we're just
  // using it for its parsing capabilities in order to find import/require
  // statements. However, if we don't give esbuild a path in `outfile`, it
  // will pipe the output to stdout, which we also don't want. So we create
  // a temporary file to serve as the esbuild output and then get rid of it
  // when we're done.
  const targetPath = await tmpName()
  const imports = new Set()

  try {
    await esbuild.build({
      bundle: true,
      entryPoints: [path],
      logLevel: 'error',
      logLimit: ESBUILD_LOG_LIMIT,
      outfile: targetPath,
      platform: 'node',
      plugins: [getListImportsPlugin({ imports, path })],
      target: 'esnext',
    })
  } catch (error) {
    error.customErrorInfo = {
      type: 'functionsBundling',
      location: { bundler: JS_BUNDLER_ZISI, functionName, runtime: RUNTIME_JS },
    }

    throw error
  } finally {
    await safeUnlink(targetPath)
  }

  return [...imports]
}

module.exports = { listImports }
