import { promises as fs } from 'fs'
import { extname } from 'path'

import type { FunctionArchive } from '../function'

// Returns the input object with an additional `size` property containing the
// size of the file at `path` when it is a ZIP archive.
const addArchiveSize = async (result: FunctionArchive) => {
  if (extname(result.path) !== '.zip') {
    return result
  }

  const { size } = await fs.stat(result.path)

  return { ...result, size }
}

export { addArchiveSize }
