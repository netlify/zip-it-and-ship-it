const { relative, resolve } = require('path')

const getNodeBindingHandlerPlugin = ({ basePath, context }) => ({
  name: 'node-binding-handler',
  setup(build) {
    build.onResolve({ filter: /\.node$/ }, (args) => {
      const fullPath = resolve(args.resolveDir, args.path)
      const resolvedPath = relative(basePath, fullPath)

      context.nodeBindings.add(fullPath)

      return {
        external: true,
        path: resolvedPath,
      }
    })
  },
})

const getPlugins = ({ basePath, context }) => [getNodeBindingHandlerPlugin({ basePath, context })]

module.exports = { getPlugins }
