// This plugin addresses an edge case with `node-fetch`. The module's `main`
// export points to an ambiguous path (`lib/index`) which, by default, is
// resolved to an ESM file by esbuild. This plugin hijacks `require()` calls
// to the module and forces the path to be `lib/index.js`.
const getNodeFetchHandlerPlugin = ({ additionalModulePaths }) => ({
  name: 'node-fetch-handler',
  setup(build) {
    build.onResolve({ filter: /^node-fetch$/ }, ({ kind, path }) => {
      if (kind !== 'require-call') {
        return
      }

      if (additionalModulePaths.length === 0) {
        return {
          path: require.resolve(path),
        }
      }

      // If we have additional module paths, these need to be included in the
      // `require.resolve` call. Unfortunately, the `options.path` parameter
      // doesn't allow us to simply add a path to the ones it uses by default.
      // We either use the defaults or we have to specify all the paths. This
      // can be done by merging `require.resolve.paths` with the paths we want
      // to add, but that primitive is not available in Node 8. In that case,
      // we re-try the `require.resolve` call with the additional paths if it
      // fails initially.

      // It's safe to disable this rule because we're checking whether the
      // function exists before attempting to use it.
      //
      // @todo Remove once we drop support for Node 8.
      // eslint-disable-next-line node/no-unsupported-features/node-builtins
      const getDefaultRequirePaths = require.resolve.paths

      if (typeof getDefaultRequirePaths !== 'function') {
        try {
          return {
            path: require.resolve(path),
          }
        } catch (_) {
          return {
            path: require.resolve(path, { paths: additionalModulePaths }),
          }
        }
      }

      const paths = [...getDefaultRequirePaths(path), ...additionalModulePaths]

      return {
        path: require.resolve(path, { paths }),
      }
    })
  },
})

const getPlugins = ({ additionalModulePaths }) => [getNodeFetchHandlerPlugin({ additionalModulePaths })]

module.exports = { getPlugins }
