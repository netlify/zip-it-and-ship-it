import type { Plugin } from '@netlify/esbuild'

const getNodeBuiltinPlugin = (): Plugin => ({
  name: 'builtin-modules',
  setup(build) {
    build.onResolve({ filter: /^node:/ }, () => ({ external: true }))
  },
})

export { getNodeBuiltinPlugin }
