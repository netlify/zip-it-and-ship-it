import { version as nodeVersion } from 'process'
import { promisify } from 'util'

import merge from 'deepmerge'
import glob from 'glob'
import semver from 'semver'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ARCHIVE_FORMAT } from '../src/archive.js'

import { invokeLambda, readAsBuffer } from './helpers/lambda.js'
import { zipFixture, unzipFiles, importFunctionFile, FIXTURES_ESM_DIR } from './helpers/main.js'
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
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          featureFlags: { zisi_functions_api_v2: true },
        }),
      })

      for (const entry of files) {
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

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
    'Handles a .mjs function',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('v2-api-mjs', {
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          featureFlags: { zisi_functions_api_v2: true },
        }),
      })

      for (const entry of files) {
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

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
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
          featureFlags: { zisi_functions_api_v2: true },
        }),
      })

      for (const entry of files) {
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

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
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('v2-api-ts', {
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
          featureFlags: { zisi_functions_api_v2: true },
        }),
      })

      for (const entry of files) {
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

      const [{ name: archive, entryFilename, path }] = files

      const untranspiledFiles = await pGlob(`${path}/**/*.ts`)
      expect(untranspiledFiles).toEqual([])

      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, headers = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world from Typescript</h1>')
      expect(headers['content-type']).toBe('text/html')
      expect(statusCode).toBe(200)
    },
  )

  test('Returns Node.js 18 if older version is set', async () => {
    const { files } = await zipFixture('v2-api-mjs', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: {
        featureFlags: { zisi_functions_api_v2: true },
        config: {
          '*': {
            nodeVersion: '16.0.0',
          },
        },
      },
    })

    expect(files[0].runtimeVersion).toBe('nodejs18.x')
  })

  test('Returns Node.js 18 if invalid version is set', async () => {
    const { files } = await zipFixture('v2-api-mjs', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: {
        featureFlags: { zisi_functions_api_v2: true },
        config: {
          '*': {
            nodeVersion: 'invalid',
          },
        },
      },
    })

    expect(files[0].runtimeVersion).toBe('nodejs18.x')
  })

  test('Returns no Node.js version if version is newer than 18 but not a valid runtime', async () => {
    const { files } = await zipFixture('v2-api-mjs', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: {
        featureFlags: { zisi_functions_api_v2: true },
        config: {
          '*': {
            nodeVersion: '19.0.0',
          },
        },
      },
    })

    expect(files[0].runtimeVersion).toBeUndefined()
  })

  test('Logs to systemlog', async () => {
    const systemLog = vi.fn()

    await zipFixture('v2-api', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: {
        featureFlags: { zisi_functions_api_v2: true },
        systemLog,
      },
    })

    expect(systemLog).toHaveBeenCalledOnce()
    expect(systemLog).toHaveBeenCalledWith('detected v2 function')
  })

  test('Does not log to systemlog for v1', async () => {
    const systemLog = vi.fn()

    await zipFixture('simple', {
      opts: {
        featureFlags: { zisi_functions_api_v2: true },
        systemLog,
      },
    })

    expect(systemLog).not.toHaveBeenCalled()
  })
})
