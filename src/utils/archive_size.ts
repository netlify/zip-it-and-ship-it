import { extname } from 'path'

import type { FunctionArchive } from '../function'

import { stat } from './fs'

// Returns the input object with an additional `size` property containing the
// size of the file at `path` when it is a ZIP archive.
const addArchiveSize = async (result: FunctionArchive) => {
  const { path } = result

  if (extname(path) !== '.zip') {
    return result
  }

  const { size } = await stat(path)

  return { ...result, size }
}

export { addArchiveSize }
