import { extname } from 'path'

import { Plugin } from 'esbuild'

const rewriteTSExtensionPlugin: Plugin = {
  name: 'rewrite-imports',
  setup(build) {
    // Targeting relative imports only, since Node modules will be marked as
    // external automatically because of `packages: "external"`.
    build.onResolve({ filter: /^\./ }, (args) => {
      const { kind, path } = args

      if (kind === 'entry-point') {
        return
      }

      // We always want to mark paths as external because we don't want to
      // actually bundle them.
      const result = {
        external: true,
      }

      // If the path has a `.ts` extension, rewrite it to `.js`.
      if (path.endsWith('.ts')) {
        return {
          ...result,
          path: `${path.slice(0, -3)}.js`,
        }
      }

      // If the path has no extension, append a `.js` extension.
      if (extname(path) === '') {
        return {
          ...result,
          path: `${path}.js`,
        }
      }

      return result
    })
  },
}

export default rewriteTSExtensionPlugin
