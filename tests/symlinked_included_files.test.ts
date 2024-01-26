import { readdir } from 'fs/promises'
import { join } from 'path'

import decompress from 'decompress'
import { dir as getTmpDir } from 'tmp-promise'
import { expect, test } from 'vitest'

import { ARCHIVE_FORMAT, zipFunction } from '../src/main.js'

import { FIXTURES_ESM_DIR } from './helpers/main.js'

/** Small helper function, reading a directory recursively and returning a record with the files and if it is a symlink or not */
const readDirWithType = async (dir: string, readFiles?: Record<string, boolean>, parent = '') => {
  const files: Record<string, boolean> = readFiles || {}
  const dirents = await readdir(dir, { withFileTypes: true })

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      await readDirWithType(join(dir, dirent.name), files, dirent.name)
    } else {
      files[join(parent, dirent.name)] = dirent.isSymbolicLink()
    }
  }

  return files
}

test('Symlinked directories from `includedFiles` are preserved', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const basePath = join(FIXTURES_ESM_DIR, 'symlinked-included-files')
  const mainFile = join(basePath, 'function.mjs')

  // assert on the source files
  expect(await readDirWithType(basePath)).toEqual({
    'function.mjs': false,
    [join('crazy-dep/package.json')]: false,
    [join('node_modules/crazy-dep')]: true,
  })

  const result = await zipFunction(mainFile, tmpDir, {
    archiveFormat: ARCHIVE_FORMAT.ZIP,
    basePath,
    config: {
      '*': {
        includedFiles: ['**'],
      },
    },
    featureFlags: {},
    repositoryRoot: basePath,
    systemLog: console.log,
    debug: true,
    internalSrcFolder: undefined,
  })

  const unzippedPath = join(tmpDir, 'extracted')
  await decompress(result!.path, unzippedPath)

  // expect that the symlink for `node_modules/crazy-dep` is preserved
  expect(await readDirWithType(unzippedPath)).toEqual({
    '___netlify-bootstrap.mjs': false,
    '___netlify-entry-point.mjs': false,
    'function.mjs': false,
    [join('crazy-dep/package.json')]: false,
    [join('node_modules/crazy-dep')]: true,
  })
})
