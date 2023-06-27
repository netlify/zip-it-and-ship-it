import { join } from 'path'
import { version as nodeVersion } from 'process'
import { promisify } from 'util'

import merge from 'deepmerge'
import glob from 'glob'
import semver from 'semver'
import { afterEach, describe, expect, vi } from 'vitest'

import { ARCHIVE_FORMAT } from '../src/archive.js'

import { invokeLambda, readAsBuffer } from './helpers/lambda.js'
import { zipFixture, unzipFiles, importFunctionFile } from './helpers/main.js'
import { testMany } from './helpers/test_many.js'

const pGlob = promisify(glob)

vi.mock('../src/utils/shell.js', () => ({ shellUtils: { runCommand: vi.fn() } }))

describe.runIf(semver.gte(nodeVersion, '18.13.0'))('V2 functions API', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  testMany(
    'Handles a basic JavaScript function',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('v2-api', {
        opts: merge(options, {
          featureFlags: { zisi_functions_api_v2: true, zisi_pure_esm: true, zisi_pure_esm_mjs: true },
        }),
      })
      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/${files[0].entryFilename}`)
      const { body: bodyStream, headers = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(headers['content-type']).toBe('text/html')
      expect(statusCode).toBe(200)
    },
  )

  testMany(
    'Handles a basic JavaScript function with archiveFormat set to `none`',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('v2-api', {
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
          featureFlags: { zisi_functions_api_v2: true, zisi_pure_esm: true, zisi_pure_esm_mjs: true },
        }),
      })

      const [{ name: archive, entryFilename }] = files
      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, headers = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(headers['content-type']).toBe('text/html')
      expect(statusCode).toBe(200)
    },
  )

  testMany(
    'Handles a basic TypeScript function',
    ['todo:bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'todo:bundler_default_nft', 'todo:bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('v2-api-ts', {
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
          featureFlags: { zisi_pure_esm: true, zisi_functions_api_v2: true },
        }),
      })

      const [{ name: archive, entryFilename, path }] = files

      const untranspiledFiles = await pGlob(join(path, "**", "*.ts"))
      expect(untranspiledFiles).toEqual([])

      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, headers = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world from Typescript</h1>')
      expect(headers['content-type']).toBe('text/html')
      expect(statusCode).toBe(200)
    },
  )
})
