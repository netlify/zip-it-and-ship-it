import type { Plugin } from '@netlify/esbuild'

import { IN_SOURCE_CONFIG_MODULE } from '../../in_source_config'

// An esbuild plugin that collects the paths of any files that import the
// in-source configuration module.
const getISCImportFinderPlugin = ({ importerPaths }: { importerPaths: Set<string> }): Plugin => ({
  name: 'find-isc-imports',
  setup(build) {
    const filter = new RegExp(`^${IN_SOURCE_CONFIG_MODULE}$`)

    build.onResolve({ filter }, (args) => {
      importerPaths.add(args.importer)

      // eslint-disable-next-line unicorn/no-useless-undefined
      return undefined
    })
  },
})

export { getISCImportFinderPlugin }
