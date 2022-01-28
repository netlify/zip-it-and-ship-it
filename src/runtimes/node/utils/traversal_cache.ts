// Local cache used for optimizing the traversal of module dependencies.
export interface TraversalCache {
  localFiles: Set<string>
  moduleNames: Set<string>
  modulePaths: Set<string>
}

export const getNewCache = (): TraversalCache => ({
  localFiles: new Set(),
  moduleNames: new Set(),
  modulePaths: new Set(),
})
