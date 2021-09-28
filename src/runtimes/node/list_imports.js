const esbuild = require('@netlify/esbuild')
const isBuiltinModule = require('is-builtin-module')
const { tmpName } = require('tmp-promise')

const { safeUnlink } = require('../../utils/fs')

const { findISCDeclarations, getISCImportFinderPlugin } = require('./in_source_config')

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

  // To be populated with the paths of the imports found.
  const imports = new Set()

  // To be populated with the paths of the files that import the in-source
  // configuration package.
  const iscImporterPaths = []

  try {
    await esbuild.build({
      bundle: true,
      entryPoints: [path],
      outfile: targetPath,
      platform: 'node',
      plugins: [getISCImportFinderPlugin({ importerPaths: iscImporterPaths }), getListImportsPlugin({ imports, path })],
    })
  } finally {
    safeUnlink(targetPath)
  }

  const [iscImporterPath] = iscImporterPaths
  const iscDeclarations = await findISCDeclarations(iscImporterPath)

  return { imports: [...imports], iscDeclarations }
}

module.exports = { listImports }
