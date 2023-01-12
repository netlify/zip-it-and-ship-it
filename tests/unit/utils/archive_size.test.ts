import { resolve } from 'path'

import { describe, expect, test } from 'vitest'

import { FunctionArchive } from '../../../src/function.js'
import { addArchiveSize } from '../../../src/utils/archive_size.js'
import { FIXTURES_DIR } from '../../helpers/main.js'

describe('addArchiveSize', () => {
  test('adds the archive size of the file at `path` if it is a ZIP archive', async () => {
    const functionArchive = {
      path: resolve(FIXTURES_DIR, 'archive-size', 'normal.zip'),
    } as FunctionArchive

    const result = await addArchiveSize(functionArchive)

    expect(result.size).toBe(1098)
  })

  test('does not add the archive size of the file at `path` if it is not a ZIP archive', async () => {
    const functionArchive = {
      path: resolve(FIXTURES_DIR, 'archive-size', 'normal.js'),
    } as FunctionArchive

    const result = await addArchiveSize(functionArchive)

    expect(result.size).toBeUndefined()
  })
})
