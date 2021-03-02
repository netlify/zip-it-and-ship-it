const { relative, resolve } = require('path')

const getNodeBindingHandlerPlugin = ({ basePath, context }) => ({
  name: 'node-binding-handler',
  setup(build) {
    // We purposely want to mutate a context that is shared between plugins.
    // eslint-disable-next-line fp/no-mutation, no-param-reassign
    context.nodeBindings = new Set()

    build.onResolve({ filter: /\.node$/ }, (args) => {
      const fullPath = resolve(args.resolveDir, args.path)
      const resolvedPath = relative(basePath, fullPath)

      context.nodeBindings.add(fullPath)

      return {
        external: true,
        path: `./${resolvedPath}`,
      }
    })
  },
})

const getPlugins = ({ basePath, context }) => [getNodeBindingHandlerPlugin({ basePath, context })]

module.exports = { getPlugins }
