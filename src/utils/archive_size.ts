import { promises as fs } from 'fs'
import { extname } from 'path'

import type { FunctionArchive } from '../function.js'

// Returns the input object with an additional `size` property containing the
// size of the file at `path` when it is a ZIP archive.
export const addArchiveSize = async (result: FunctionArchive) => {
  const { path } = result

  if (extname(path) !== '.zip') {
    return result
  }

  const { size } = await fs.stat(path)

  return { ...result, size }
}
