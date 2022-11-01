import type { Stats } from 'fs'

export type FileCache = Map<string, Promise<string>>
export type LstatCache = Map<string, Promise<Stats>>
export type ReaddirCache = Map<string, Promise<string[]>>

interface NFTCache {
  fileCache: FileCache
  statCache: Map<string, unknown>
  symlinkCache: Map<string, unknown>
  analysisCache: Map<string, unknown>
}

export interface RuntimeCache {
  // file content
  fileCache: FileCache
  lstatCache: LstatCache
  readDirCache: ReaddirCache
  // NFT cache, which should not be used in zisi and only supplied to NFT
  // this cache shares the file cache with zisi
  nftCache: Partial<NFTCache>
}

export const createNewCache = (): RuntimeCache => {
  const cache: RuntimeCache = Object.create(null)

  cache.fileCache = new Map()
  cache.lstatCache = new Map()
  cache.readDirCache = new Map()

  cache.nftCache = Object.create(null)
  cache.nftCache.fileCache = cache.fileCache

  return cache
}
