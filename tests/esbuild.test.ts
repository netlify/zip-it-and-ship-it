import { build } from '@netlify/esbuild'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ARCHIVE_FORMAT } from '../src/archive.js'
import { NODE_BUNDLER } from '../src/runtimes/node/bundlers/types.js'

import { zipFixture } from './helpers/main.js'

// eslint-disable-next-line import/no-unassigned-import
import 'source-map-support/register'

vi.mock('../src/utils/shell.js', () => ({ shellUtils: { runCommand: vi.fn() } }))

vi.mock('@netlify/esbuild', async () => {
  const esbuild = await vi.importActual<any>('@netlify/esbuild')

  return {
    ...esbuild,
    build: vi.fn(esbuild.build),
  }
})

describe('esbuild', () => {
  afterEach(() => {
    vi.mocked(build).mockReset()
  })

  test('Generates a bundle for the Node runtime version specified in the `nodeVersion` config property', async () => {
    // Using the optional catch binding feature to assert that the bundle is
    // respecting the Node version supplied.
    // - in Node <10 we should see `try {} catch (e) {}`
    // - in Node >= 10 we should see `try {} catch {}`
    await zipFixture('node-module-optional-catch-binding', {
      opts: {
        archiveFormat: ARCHIVE_FORMAT.NONE,
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD, nodeVersion: '18.x' } },
      },
    })

    expect(build).toHaveBeenCalledWith(expect.objectContaining({ target: ['node18'] }))
  })
})
