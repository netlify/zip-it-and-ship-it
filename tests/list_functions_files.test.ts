import { join } from 'path'

import merge from 'deepmerge'
import sortOn from 'sort-on'
import { describe, expect, test, vi } from 'vitest'

import { listFunctionsFiles } from '../src/main'

import { FIXTURES_DIR, normalizeFiles } from './helpers/main'
import { allBundleConfigs, testMany } from './helpers/test_many.js'

describe('listFunctionsFiles', () => {
  testMany(
    'Can list all function files with listFunctionsFiles()',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureDir = `${FIXTURES_DIR}/list`
      const opts = merge(options, {
        basePath: fixtureDir,
      })
      const bundler = options.getCurrentBundlerName()
      const files = await listFunctionsFiles(fixtureDir, opts)
      const sortedFiles = sortOn(files, ['mainFile', 'srcFile'])
      const expectedFiles = [
        {
          name: 'five',
          mainFile: 'five/index.ts',
          runtime: 'js',
          extension: '.ts',
          schedule: undefined,
          srcFile: 'five/index.ts',
        },

        bundler === 'nft' && {
          name: 'five',
          mainFile: 'five/index.ts',
          runtime: 'js',
          extension: '.ts',
          srcFile: 'five/util.ts',
          schedule: undefined,
        },

        {
          name: 'four',
          mainFile: 'four.js/four.js.js',
          runtime: 'js',
          extension: '.js',
          srcFile: 'four.js/four.js.js',
          schedule: undefined,
        },
        {
          name: 'one',
          mainFile: 'one/index.js',
          runtime: 'js',
          extension: '.js',
          schedule: undefined,
          srcFile: 'one/index.js',
        },
        { name: 'test', mainFile: 'test', runtime: 'go', extension: '', schedule: undefined, srcFile: 'test' },
        { name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js', schedule: undefined, srcFile: 'test.js' },
        {
          name: 'test',
          mainFile: 'test.zip',
          runtime: 'js',
          extension: '.zip',
          schedule: undefined,
          srcFile: 'test.zip',
        },

        (bundler === undefined || bundler === 'nft') && {
          name: 'two',
          mainFile: 'two/two.js',
          runtime: 'js',
          extension: '.json',
          schedule: undefined,
          srcFile: 'two/three.json',
        },

        {
          name: 'two',
          mainFile: 'two/two.js',
          runtime: 'js',
          extension: '.js',
          schedule: undefined,
          srcFile: 'two/two.js',
        },
      ]
        .filter(Boolean)
        .map(normalizeFiles.bind(null, fixtureDir))

      expect(sortedFiles).toEqual(sortOn(expectedFiles, ['mainFile', 'srcFile']))
    },
  )

  testMany(
    'Can list all function files from multiple source directories with listFunctionsFiles()',
    [...allBundleConfigs, 'bundler_none'],
    async (options) => {
      const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
      const opts = merge(options, {
        basePath: fixtureDir,
      })
      const bundler = options.getCurrentBundlerName()
      const functions = await listFunctionsFiles(
        [join(fixtureDir, '.netlify', 'internal-functions'), join(fixtureDir, 'netlify', 'functions')],
        opts,
      )
      const sortedFunctions = sortOn(functions, 'mainFile')
      const shouldInlineFiles = bundler === 'esbuild_zisi' || bundler === 'esbuild' || bundler === 'none'

      expect(sortedFunctions).toEqual(
        sortOn(
          [
            {
              name: 'function',
              mainFile: '.netlify/internal-functions/function.js',
              runtime: 'js',
              extension: '.js',
              srcFile: '.netlify/internal-functions/function.js',
            },

            !shouldInlineFiles && {
              name: 'function',
              mainFile: '.netlify/internal-functions/function.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'node_modules/test/index.js',
            },

            !shouldInlineFiles && {
              name: 'function',
              mainFile: '.netlify/internal-functions/function.js',
              runtime: 'js',
              extension: '.json',
              srcFile: 'node_modules/test/package.json',
            },

            {
              name: 'function_internal',
              mainFile: '.netlify/internal-functions/function_internal.js',
              runtime: 'js',
              extension: '.js',
              srcFile: '.netlify/internal-functions/function_internal.js',
            },

            !shouldInlineFiles && {
              name: 'function_internal',
              mainFile: '.netlify/internal-functions/function_internal.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'node_modules/test/index.js',
            },

            !shouldInlineFiles && {
              name: 'function_internal',
              mainFile: '.netlify/internal-functions/function_internal.js',
              runtime: 'js',
              extension: '.json',
              srcFile: 'node_modules/test/package.json',
            },

            {
              name: 'function',
              mainFile: 'netlify/functions/function.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'netlify/functions/function.js',
            },

            !shouldInlineFiles && {
              name: 'function',
              mainFile: 'netlify/functions/function.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'node_modules/test/index.js',
            },

            !shouldInlineFiles && {
              name: 'function',
              mainFile: 'netlify/functions/function.js',
              runtime: 'js',
              extension: '.json',
              srcFile: 'node_modules/test/package.json',
            },

            {
              name: 'function_user',
              mainFile: 'netlify/functions/function_user.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'netlify/functions/function_user.js',
            },

            !shouldInlineFiles && {
              name: 'function_user',
              mainFile: 'netlify/functions/function_user.js',
              runtime: 'js',
              extension: '.js',
              srcFile: 'node_modules/test/index.js',
            },

            !shouldInlineFiles && {
              name: 'function_user',
              mainFile: 'netlify/functions/function_user.js',
              runtime: 'js',
              extension: '.json',
              srcFile: 'node_modules/test/package.json',
            },
          ],
          'mainFile',
        )
          .filter(Boolean)
          .map(normalizeFiles.bind(null, fixtureDir)),
      )
    },
  )

  test('listFunctionsFiles throws if all function directories do not exist', async () => {
    await expect(
      async () =>
        await listFunctionsFiles([
          join(FIXTURES_DIR, 'missing-functions-folder', 'functions'),
          join(FIXTURES_DIR, 'missing-functions-folder', 'functions2'),
        ]),
    ).rejects.toThrow(/Functions folders do not exist: /)
  })

  test('listFunctionsFiles does not hide errors that have nothing todo with folder existents', async () => {
    // @ts-expect-error test
    await expect(() => listFunctionsFiles([true])).rejects.toThrow(
      expect.not.stringContaining('Functions folders do not exist:'),
    )
  })

  test('listFunctionsFiles includes in-source config declarations', async () => {
    const functions = await listFunctionsFiles(join(FIXTURES_DIR, 'in-source-config', 'functions'), {
      parseISC: true,
    })
    functions.forEach((func) => {
      expect(func.schedule).toBe('@daily')
    })
  })

  test('listFunctionsFiles does not include wrong arch functions and warns', async () => {
    const warn = vi.spyOn(console, 'warn')
    const functions = await listFunctionsFiles(join(FIXTURES_DIR, 'wrong-prebuilt-architecture'))

    expect(functions.length).toBe(0)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Darwin/Arm64'))
    warn.mockRestore()
  })

  test('listFunctionsFiles includes json configured functions with configured properties', async () => {
    const dir = join(FIXTURES_DIR, 'json-config/.netlify/functions-internal/')
    const [func] = await listFunctionsFiles([dir], {
      configFileDirectories: [dir],
    })

    expect(func.displayName).toBe('A Display Name')
    expect(func.generator).toBe('@netlify/mock-plugin@1.0.0')
  })
})
