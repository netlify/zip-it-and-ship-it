// Local cache used for optimizing the traversal of module dependencies.
const getNewCache = () => ({ localFiles: new Set(), moduleNames: new Set(), modulePaths: new Set() })

module.exports = { getNewCache }
