import { readFile } from 'fs/promises'
import { join, resolve } from 'path'
import { platform, version as nodeVersion } from 'process'
import { promisify } from 'util'

import merge from 'deepmerge'
import glob from 'glob'
import semver from 'semver'
import { dir as getTmpDir } from 'tmp-promise'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { ARCHIVE_FORMAT } from '../src/archive.js'

import { invokeLambda, readAsBuffer } from './helpers/lambda.js'
import { zipFixture, unzipFiles, importFunctionFile, FIXTURES_ESM_DIR, FIXTURES_DIR } from './helpers/main.js'
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
        opts: options,
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('esm')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/${files[0].entryFilename}`)
      const { body: bodyStream, multiValueHeaders = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(multiValueHeaders['content-type']).toEqual(['text/html'])
      expect(statusCode).toBe(200)
    },
  )

  testMany(
    'Handles a .mjs function',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('v2-api-mjs', {
        fixtureDir: FIXTURES_ESM_DIR,
        opts: options,
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('esm')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/${files[0].entryFilename}`)
      const { body: bodyStream, multiValueHeaders = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(multiValueHeaders['content-type']).toEqual(['text/html'])
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
        }),
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('esm')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

      const [{ name: archive, entryFilename }] = files
      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, multiValueHeaders = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(multiValueHeaders['content-type']).toEqual(['text/html'])
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
        }),
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('cjs')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)
      }

      const [{ name: archive, entryFilename, path }] = files

      const untranspiledFiles = await pGlob(`${path}/**/*.ts`)
      expect(untranspiledFiles).toEqual([])

      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, multiValueHeaders = {}, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(body).toBe('<h1>Hello world from Typescript</h1>')
      expect(multiValueHeaders['content-type']).toEqual(['text/html'])
      expect(statusCode).toBe(200)
    },
  )

  testMany(
    'Handles an ESM function that imports both CJS and ESM modules',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'v2-api-esm-mixed-modules'
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length: 2,
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
        }),
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('esm')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)

        const expectedInputs = [
          'package.json',
          entry.name === 'function-js' ? 'function-js.js' : 'function-ts.ts',
          'node_modules/cjs-module/package.json',
          'node_modules/cjs-module/index.js',
          'node_modules/esm-module/package.json',
          'node_modules/esm-module/index.js',
          'node_modules/esm-module/foo.js',
          'node_modules/cjs-module/foo.js',
          'lib/helper1.ts',
          'lib/helper2.ts',
          'lib/helper3.ts',
          'lib/helper4.js',
          'lib/helper5.mjs',
          'lib/helper6.js',
        ]
          .map((relativePath) => resolve(FIXTURES_ESM_DIR, fixtureName, relativePath))
          .sort()

        expect(entry.inputs?.sort()).toEqual(expectedInputs)

        const [{ name: archive, entryFilename }] = files

        const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
        const { body: bodyStream, statusCode } = await invokeLambda(func)
        const body = await readAsBuffer(bodyStream)

        expect(JSON.parse(body)).toEqual({
          cjs: { foo: '🌭', type: 'cjs' },
          esm: { foo: '🌭', type: 'esm' },
          helper1: 'helper1',
          helper2: 'helper2',
          helper3: 'helper3',
          helper4: 'helper4',
          helper5: 'helper5',
        })
        expect(statusCode).toBe(200)
      }
    },
  )

  testMany(
    'Handles a CJS function that imports CJS and ESM modules',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const fixtureName = 'v2-api-cjs-modules'
      const { files, tmpDir } = await zipFixture(fixtureName, {
        length: 2,
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
        }),
      })

      for (const entry of files) {
        expect(entry.bundler).toBe('nft')
        expect(entry.outputModuleFormat).toBe('cjs')
        expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
        expect(entry.runtimeAPIVersion).toBe(2)

        const expectedInputs = [
          'package.json',
          entry.name === 'function-ts' ? 'function-ts.ts' : 'function-js.js',
          'node_modules/cjs-module/package.json',
          'node_modules/cjs-module/index.js',
          'node_modules/esm-module/package.json',
          'node_modules/esm-module/index.js',
          'node_modules/esm-module/foo.js',
          'node_modules/cjs-module/foo.js',
          'lib/helper1.ts',
          'lib/helper2.ts',
          'lib/helper3.ts',
          'lib/helper4.js',
          'lib/helper5.mjs',
        ]
          .map((relativePath) => resolve(FIXTURES_ESM_DIR, fixtureName, relativePath))
          .sort()

        expect(entry.inputs?.sort()).toEqual(expectedInputs)

        const [{ name: archive, entryFilename }] = files

        const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
        const { body: bodyStream, statusCode } = await invokeLambda(func)
        const body = await readAsBuffer(bodyStream)

        expect(JSON.parse(body)).toEqual({
          cjs: { foo: '🌭', type: 'cjs' },
          esm: { foo: '🌭', type: 'esm' },
          helper1: 'helper1',
          helper2: 'helper2',
          helper3: 'helper3',
          helper4: 'helper4',
          helper5: 'helper5',
        })
        expect(statusCode).toBe(200)
      }
    },
  )

  testMany('Handles a CJS TypeScript function that uses path aliases', ['bundler_default'], async (options) => {
    const { files, tmpDir } = await zipFixture('v2-api-cjs-ts-aliases', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: merge(options, {
        archiveFormat: ARCHIVE_FORMAT.NONE,
      }),
    })

    for (const entry of files) {
      expect(entry.bundler).toBe('nft')
      expect(entry.outputModuleFormat).toBe('cjs')
      expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
      expect(entry.runtimeAPIVersion).toBe(2)
    }

    const [{ name: archive, entryFilename }] = files

    const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
    const { body: bodyStream, statusCode } = await invokeLambda(func)
    const body = await readAsBuffer(bodyStream)

    expect(JSON.parse(body)).toEqual({
      cjs: { foo: '🌭', type: 'cjs' },
      esm: { foo: '🌭', type: 'esm' },
      helper1: 'helper1',
      helper2: 'helper2',
      helper3: 'helper3',
      helper4: 'helper4',
      helper5: 'helper5',
    })
    expect(statusCode).toBe(200)
  })

  testMany('Handles an ESM TypeScript function that uses path aliases', ['bundler_default'], async (options) => {
    const { files, tmpDir } = await zipFixture('v2-api-esm-ts-aliases', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: merge(options, {
        archiveFormat: ARCHIVE_FORMAT.NONE,
      }),
    })

    for (const entry of files) {
      expect(entry.bundler).toBe('nft')
      expect(entry.outputModuleFormat).toBe('esm')
      expect(entry.entryFilename).toBe('___netlify-entry-point.mjs')
      expect(entry.runtimeAPIVersion).toBe(2)
    }

    const [{ name: archive, entryFilename }] = files

    const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
    const { body: bodyStream, statusCode } = await invokeLambda(func)
    const body = await readAsBuffer(bodyStream)

    expect(JSON.parse(body)).toEqual({
      cjs: { foo: '🌭', type: 'cjs' },
      esm: { foo: '🌭', type: 'esm' },
      helper1: 'helper1',
      helper2: 'helper2',
      helper3: 'helper3',
      helper4: 'helper4',
      helper5: 'helper5',
    })
    expect(statusCode).toBe(200)
  })

  test('Returns Node.js 18 if older version is set', async () => {
    const { files } = await zipFixture('v2-api-mjs', {
      fixtureDir: FIXTURES_ESM_DIR,
      opts: {
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
        config: {
          '*': {
            nodeVersion: '19.0.0',
          },
        },
      },
    })

    expect(files[0].runtimeVersion).toBeUndefined()
  })

  test('Does not log to systemlog for v1', async () => {
    const systemLog = vi.fn()

    await zipFixture('simple', {
      opts: {
        systemLog,
      },
    })

    expect(systemLog).not.toHaveBeenCalled()
  })

  test('Extracts routes from the `path` in-source configuration property', async () => {
    const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
    const manifestPath = join(tmpDir, 'manifest.json')

    const { files } = await zipFixture('v2-api-with-path', {
      fixtureDir: FIXTURES_ESM_DIR,
      length: 3,
      opts: {
        manifest: manifestPath,
      },
    })

    expect.assertions(files.length + 4)

    for (const file of files) {
      switch (file.name) {
        case 'with-literal':
          expect(file.generator).toBe('foo@1.2.3')
          expect(file.displayName).toBe('Product List')
          expect(file.routes).toEqual([{ pattern: '/products', literal: '/products', methods: ['GET', 'POST'] }])

          break

        case 'with-named-group':
          expect(file.routes).toEqual([
            {
              pattern: '/products/:id',
              expression: '^\\/products(?:\\/([^\\/]+?))\\/?$',
              methods: [],
            },
          ])

          break

        case 'with-regex':
          expect(file.routes).toEqual([
            {
              pattern: '/numbers/(\\d+)',
              expression: '^\\/numbers(?:\\/(\\d+))\\/?$',
              methods: [],
            },
          ])

          break

        default:
          continue
      }
    }

    const manifestString = await readFile(manifestPath, { encoding: 'utf8' })
    const manifest = JSON.parse(manifestString)
    expect(manifest.functions[0].routes[0].methods).toEqual(['GET', 'POST'])
    expect(manifest.functions[0].buildData.runtimeAPIVersion).toEqual(2)
  })

  test('Flags invalid values of the `path` in-source configuration property as user errors', async () => {
    expect.assertions(3)

    try {
      await zipFixture('v2-api-with-invalid-path', {
        fixtureDir: FIXTURES_ESM_DIR,
      })
    } catch (error) {
      const { customErrorInfo } = error

      expect(customErrorInfo.type).toBe('functionsBundling')
      expect(customErrorInfo.location.functionName).toBe('function')
      expect(customErrorInfo.location.runtime).toBe('js')
    }
  })

  testMany(
    'Retrieves the process environment through the Netlify.env helper',
    ['bundler_default', 'bundler_esbuild', 'bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files, tmpDir } = await zipFixture('v2-api-environment-variables', {
        fixtureDir: FIXTURES_ESM_DIR,
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
        }),
      })

      vi.stubEnv('foo', 'foo!')
      vi.stubEnv('baz', 'baz!')

      const [{ name: archive, entryFilename }] = files
      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      const parsed = JSON.parse(body)

      expect(parsed).toMatchObject({
        text: 'Foo bar!',
        foo: true,
        env: expect.objectContaining({
          foo: 'foo!',
        }),
        baz: 'baz!',
      })
      // bar got set and deleted again
      expect(parsed).not.toHaveProperty('bar')
      expect(statusCode).toBe(200)
    },
  )

  describe('Handles an ESM module installed with pnpm', () => {
    test('With `archiveFormat: none`', async (options) => {
      const fixtureName = 'pnpm-esm-v2'
      const { files, tmpDir } = await zipFixture(join(fixtureName, 'netlify', 'functions'), {
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.NONE,
          basePath: join(FIXTURES_DIR, fixtureName),
        }),
      })

      const [{ name: archive, entryFilename }] = files
      const func = await importFunctionFile(`${tmpDir}/${archive}/${entryFilename}`)
      const { body: bodyStream, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(statusCode).toBe(200)
      expect(body).toBe('foo!bar')
    })

    // TODO: Investigate why this is failing on Windows.
    test.skipIf(platform === 'win32')('With `archiveFormat: zip`', async (options) => {
      const fixtureName = 'pnpm-esm-v2'
      const { files } = await zipFixture(join(fixtureName, 'netlify', 'functions'), {
        opts: merge(options, {
          archiveFormat: ARCHIVE_FORMAT.ZIP,
          basePath: join(FIXTURES_DIR, fixtureName),
        }),
      })

      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/${files[0].entryFilename}`)
      const { body: bodyStream, statusCode } = await invokeLambda(func)
      const body = await readAsBuffer(bodyStream)

      expect(statusCode).toBe(200)
      expect(body).toBe('foo!bar')
    })
  })
})
