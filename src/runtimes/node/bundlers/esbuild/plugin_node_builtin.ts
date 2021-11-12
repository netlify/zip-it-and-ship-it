import type { Plugin } from '@netlify/esbuild'

const getNodeBuiltinPlugin = (): Plugin => ({
  name: 'builtin-modules',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, (args) => ({ path: args.path.slice('node:'.length), external: true }))
  },
})

export { getNodeBuiltinPlugin }
