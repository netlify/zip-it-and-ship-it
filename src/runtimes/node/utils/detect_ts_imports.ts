import { extname } from 'path'

import { nodeFileTrace } from '@vercel/nft'

import { RuntimeCache } from '../../../utils/cache.js'

const detectTSImports = async (entrypoint: string, cache: RuntimeCache): Promise<boolean> => {
  const { fileList } = await nodeFileTrace([entrypoint], {
    // we only need to look at user-written files, node_modules is expected to be JS
    ignore: ['node_modules'],
    cache: cache.nftCache,
  })

  return [...fileList].some((file) => extname(file).includes('ts'))
}

export default detectTSImports
