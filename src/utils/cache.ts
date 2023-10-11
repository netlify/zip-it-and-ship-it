import type { Stats } from 'fs'

export type FileCache = Map<string, Promise<string>>
export type LstatCache = Map<string, Promise<Stats>>
export type ReaddirCache = Map<string, Promise<string[]>>

interface NFTCache {
  fileCache: FileCache
  // nft actually sets even more properties on this object, but
  // they do not have any relevance for us here
}

export class RuntimeCache {
  // Cache for fs.readFile() calls
  fileCache: FileCache

  // Cache for fs.lstat() calls
  lstatCache: LstatCache

  // Cache fs.readdir() calls
  readdirCache: ReaddirCache

  // NFT cache, which should not be used in zisi and only supplied to NFT
  // this cache shares the file cache with zisi
  nftCache: NFTCache

  constructor() {
    this.fileCache = new Map()
    this.lstatCache = new Map()
    this.readdirCache = new Map()

    this.nftCache = Object.create(null)
    this.nftCache.fileCache = this.fileCache
  }
}
