import { join } from 'path'

import merge from 'deepmerge'
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
      const functions = await listFunctionsFiles(fixtureDir, opts)

      expect(functions.map((file) => normalizeFiles(fixtureDir, file))).toMatchSnapshot()
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
      const functions = await listFunctionsFiles(
        [join(fixtureDir, '.netlify', 'internal-functions'), join(fixtureDir, 'netlify', 'functions')],
        opts,
      )

      expect(functions.map((file) => normalizeFiles(fixtureDir, file))).toMatchSnapshot()
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      /* ignore */
    })
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
