import { join } from 'path'

import decompress from 'decompress'
import glob from 'fast-glob'
import { dir as getTmpDir } from 'tmp-promise'
import { expect, test } from 'vitest'

import { ARCHIVE_FORMAT, zipFunction } from '../src/main.js'

import { FIXTURES_ESM_DIR } from './helpers/main.js'

test('The telemetry file should be added by default to the function bundle', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const basePath = join(FIXTURES_ESM_DIR, 'v2-api')
  const mainFile = join(basePath, 'function.js')

  const result = await zipFunction(mainFile, tmpDir, {
    archiveFormat: ARCHIVE_FORMAT.ZIP,
    basePath,
    config: {
      '*': {
        includedFiles: ['**'],
      },
    },
    repositoryRoot: basePath,
    systemLog: console.log,
    debug: true,
    internalSrcFolder: undefined,
  })

  const unzippedPath = join(tmpDir, 'extracted')

  await decompress(result!.path, unzippedPath)

  const files = await glob('**/*', { cwd: unzippedPath })
  expect(files.sort()).toEqual([
    '___netlify-bootstrap.mjs',
    '___netlify-entry-point.mjs',
    '___netlify-telemetry.mjs',
    'function.mjs',
    'package.json',
  ])
})

test('The telemetry file should be added if bundler is none', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const basePath = join(FIXTURES_ESM_DIR, 'v2-api')
  const mainFile = join(basePath, 'function.js')

  const result = await zipFunction(mainFile, tmpDir, {
    archiveFormat: ARCHIVE_FORMAT.NONE,
    basePath,
    config: {
      '*': {
        includedFiles: ['**'],
      },
    },
    repositoryRoot: basePath,
    systemLog: console.log,
    debug: true,
    internalSrcFolder: undefined,
  })

  const files = await glob('**/*', { cwd: result!.path })
  expect(files.sort()).toEqual([
    '___netlify-bootstrap.mjs',
    '___netlify-entry-point.mjs',
    '___netlify-telemetry.mjs',
    'function.mjs',
    'package.json',
  ])
})

test('The telemetry file should not be added to the bundle if the feature flag is explicitly turned off', async () => {
  const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
  const basePath = join(FIXTURES_ESM_DIR, 'v2-api')
  const mainFile = join(basePath, 'function.js')

  const result = await zipFunction(mainFile, tmpDir, {
    archiveFormat: ARCHIVE_FORMAT.ZIP,
    basePath,
    config: {
      '*': {
        includedFiles: ['**'],
      },
    },
    featureFlags: { zisi_add_instrumentation_loader: false },
    repositoryRoot: basePath,
    systemLog: console.log,
    debug: true,
    internalSrcFolder: undefined,
  })

  const unzippedPath = join(tmpDir, 'extracted')
  await decompress(result!.path, unzippedPath)

  const files = await glob('**/*', { cwd: unzippedPath })
  expect(files.sort()).toEqual([
    '___netlify-bootstrap.mjs',
    '___netlify-entry-point.mjs',
    'function.mjs',
    'package.json',
  ])
})
