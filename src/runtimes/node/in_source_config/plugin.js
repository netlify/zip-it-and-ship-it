const { IN_SOURCE_CONFIG_MODULE } = require('../../../utils/consts')

// An esbuild plugin that collects the paths of any files that import the
// in-source configuration module.
const getISCImportFinderPlugin = ({ importerPaths }) => ({
  name: 'find-isc-imports',
  setup(build) {
    const filter = new RegExp(`^${IN_SOURCE_CONFIG_MODULE}$`)

    build.onResolve({ filter }, ({ importer }) => {
      importerPaths.push(importer)
    })
  },
})

module.exports = { getISCImportFinderPlugin }
