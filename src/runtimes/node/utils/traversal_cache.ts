// Local cache used for optimizing the traversal of module dependencies.
interface TraversalCache {
  localFiles: Set<string>
  moduleNames: Set<string>
  modulePaths: Set<string>
}

const getNewCache = (): TraversalCache => ({
  localFiles: new Set(),
  moduleNames: new Set(),
  modulePaths: new Set(),
})

export { TraversalCache, getNewCache }
