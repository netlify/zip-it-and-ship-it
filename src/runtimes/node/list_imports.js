const esbuild = require('@netlify/esbuild')
const isBuiltinModule = require('is-builtin-module')
const { tmpName } = require('tmp-promise')

const { safeUnlink } = require('../../utils/fs')

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

const listImports = async ({ path }) => {
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
      entryPoints: [path],
      bundle: true,
      outfile: targetPath,
      platform: 'node',
      plugins: [getListImportsPlugin({ imports, path })],
    })
  } finally {
    await safeUnlink(targetPath)
  }

  return [...imports]
}

module.exports = { listImports }
