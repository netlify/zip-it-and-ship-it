import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'

import merge from 'deepmerge'
import { dir as getTmpDir } from 'tmp-promise'
import unixify from 'unixify'
import { describe, expect, test, vi } from 'vitest'

import { ARCHIVE_FORMAT, NODE_BUNDLER, zipFunction } from '../src/main.js'

import {
  FIXTURES_DIR,
  FIXTURES_ESM_DIR,
  getBundlerNameFromOptions,
  importFunctionFile,
  unzipFiles,
} from './helpers/main.js'
import { allBundleConfigs, getNodeBundlerString, testMany } from './helpers/test_many.js'

describe('zipFunction', () => {
  describe('v1', () => {
    testMany(
      'Resolves dependencies from .netlify/plugins/node_modules when using `zipFunction()`',
      [...allBundleConfigs],
      async (options) => {
        const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
        const mainFile = join(FIXTURES_DIR, 'node-module-next-image', 'function', 'function.js')
        const result = (await zipFunction(mainFile, tmpDir, options))!

        expect(result).not.toBeUndefined()

        const unzippedFunctions = await unzipFiles([result])

        const func = await importFunctionFile(join(unzippedFunctions[0].unzipPath, 'function.js'))

        expect(func).toBe(true)
      },
    )

    testMany(
      'Includes includedFiles in the response of zipFunction',
      [...allBundleConfigs, 'bundler_none'],
      async (options) => {
        const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
        const mainFile = join(FIXTURES_DIR, 'node-module-next-image', 'function', 'function.js')
        const result = (await zipFunction(mainFile, tmpDir, {
          ...options,
          basePath: join(FIXTURES_DIR, 'node-module-next-image'),
          config: {
            '*': {
              includedFiles: ['included/*.js'],
            },
          },
        }))!

        expect(result).not.toBeUndefined()

        expect(Array.isArray(result.includedFiles)).toBe(true)
        expect(unixify(result.includedFiles![0])).toMatch(/node-module-next-image\/included\/abc\.js/)
      },
    )

    testMany('Can use zipFunction()', [...allBundleConfigs, 'bundler_none'], async (options, variation) => {
      const bundler = getBundlerNameFromOptions(options)
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const mainFile = join(FIXTURES_DIR, 'simple', 'function.js')
      const result = (await zipFunction(mainFile, tmpDir, options))!

      expect(result).not.toBeUndefined()

      const bundlerUsed = getNodeBundlerString(variation)
      const expectedConfig = options.config['*']
      expectedConfig.nodeBundler = bundlerUsed

      expect(result.name).toBe('function')
      expect(result.runtime).toBe('js')
      expect(result.bundler).toBe(bundlerUsed)
      expect(result.mainFile).toBe(mainFile)
      expect(result.config).toEqual(bundler === undefined ? {} : expectedConfig)
      expect(result.runtimeAPIVersion).toEqual(1)
    })

    test('When generating a directory for a function with `archiveFormat: "none"`, it empties the directory before copying any files', async () => {
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const functionDirectory = join(tmpDir, 'function')

      await mkdir(functionDirectory, { recursive: true })

      const testFilePath = join(functionDirectory, 'some-file.js')

      await writeFile(testFilePath, 'module.exports = true')

      await zipFunction(`${FIXTURES_DIR}/simple/function.js`, tmpDir, {
        archiveFormat: ARCHIVE_FORMAT.NONE,
      })

      const functionEntry = await importFunctionFile(`${functionDirectory}/function.js`)

      expect(functionEntry).toBe(true)

      await expect(testFilePath).not.toPathExist()
    })

    test('Creates dynamic import shims for functions using `zipFunction`', async () => {
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const fixtureDir = join(FIXTURES_DIR, 'node-module-dynamic-import-2')
      const result = (await zipFunction(join(fixtureDir, 'function.js'), tmpDir, {
        basePath: fixtureDir,
        config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
      }))!

      const unzippedFunctions = await unzipFiles([result])

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function.js`)

      expect(func('en')[0]).toEqual(['yes', 'no'])
      expect(func('en')[1]).toEqual(['yes', 'no'])
      expect(func('pt')[0]).toEqual(['sim', 'não'])
      expect(func('pt')[1]).toEqual(['sim', 'não'])
      expect(() => func('fr')).toThrow()
    })

    testMany(
      'Can find Node modules in the `repositoryRoot` path, even if it is a parent directory of `basePath`',
      ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
      async (options) => {
        const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
        const fixtureDir = join(FIXTURES_DIR, 'node-monorepo')
        const basePath = join(fixtureDir, 'packages', 'site-1', 'netlify', 'functions')
        const opts = merge(options, {
          basePath,
          config: {
            '*': {
              externalNodeModules: ['@netlify/mock-package-2'],
            },
          },
          repositoryRoot: fixtureDir,
        })
        const result = (await zipFunction(`${basePath}/function-1.js`, tmpDir, opts))!

        const unzippedFunctions = await unzipFiles([result])

        const { mock1, mock2 } = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/function-1.js`)

        expect(mock1).toBe(true)
        expect(mock2).toBe(true)
      },
    )

    testMany(
      'Can populate the configured properties for functions',
      ['bundler_default', 'bundler_esbuild', 'bundler_nft'],
      async (options) => {
        const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
        const basePath = join(FIXTURES_DIR, 'node-configs')
        const opts = merge(options, {
          config: { 'function-1': { name: 'Function One', generator: '@netlify/mock-plugin@1.0.0' } },
        })
        const result = (await zipFunction(`${basePath}/function-1.js`, tmpDir, opts))!

        expect(result.displayName).toBe('Function One')
        expect(result.generator).toBe('@netlify/mock-plugin@1.0.0')
      },
    )
  })

  describe('v2', () => {
    testMany('Can use zipFunction()', [...allBundleConfigs, 'bundler_none'], async (options, variation) => {
      const bundler = getBundlerNameFromOptions(options)
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const mainFile = join(FIXTURES_ESM_DIR, 'v2-api', 'function.js')
      const result = (await zipFunction(mainFile, tmpDir, {
        ...options,
      }))!

      expect(result).not.toBeUndefined()

      const expectedBundle = variation === 'bundler_none' ? NODE_BUNDLER.NONE : NODE_BUNDLER.NFT
      const expectedConfig = options.config['*']
      expectedConfig.nodeBundler = variation === 'bundler_default' ? NODE_BUNDLER.NFT : getNodeBundlerString(variation)

      expect(result.name).toBe('function')
      expect(result.runtime).toBe('js')
      expect(result.bundler).toBe(expectedBundle)
      expect(result.mainFile).toBe(mainFile)
      expect(result.config).toEqual(bundler === undefined ? {} : expectedConfig)
      expect(result.runtimeAPIVersion).toEqual(2)
      expect(result.entryFilename).toEqual('___netlify-entry-point.mjs')
    })

    test('Does not log to systemlog for v1', async () => {
      const { path: tmpDir } = await getTmpDir({ prefix: 'zip-it-test' })
      const mainFile = join(FIXTURES_DIR, 'simple', 'function.js')
      const systemLog = vi.fn()

      await zipFunction(mainFile, tmpDir, {
        systemLog,
      })

      expect(systemLog).not.toHaveBeenCalled()
    })
  })
})
