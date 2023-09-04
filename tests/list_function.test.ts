import { join } from 'path'

import { describe, expect, test } from 'vitest'

import { listFunction } from '../src/main.js'

import { FIXTURES_DIR, FIXTURES_ESM_DIR } from './helpers/main.js'

describe('listFunction', () => {
  describe('v1', () => {
    test('listFunction does not include runtimeAPIVersion when parseISC false', async () => {
      const mainFile = join(FIXTURES_DIR, 'in-source-config/functions/cron_cjs.js')
      const func = await listFunction(mainFile, {
        parseISC: false,
      })

      expect(func?.runtimeAPIVersion).toBeUndefined()
    })

    test('listFunction includes runtimeAPIVersion when parseISC true', async () => {
      const mainFile = join(FIXTURES_DIR, 'in-source-config/functions/cron_cjs.js')
      const func = await listFunction(mainFile, {
        parseISC: true,
      })

      expect(func?.runtimeAPIVersion).toBe(1)
    })

    test('listFunction includes in-source config declarations', async () => {
      const mainFile = join(FIXTURES_DIR, 'in-source-config/functions/cron_cjs.js')
      const func = await listFunction(mainFile, {
        parseISC: true,
      })

      expect(func).toEqual({
        extension: '.js',
        mainFile,
        name: 'cron_cjs',
        runtime: 'js',
        runtimeAPIVersion: 1,
        schedule: '@daily',
      })
    })

    test('listFunction includes json configured functions with configured properties', async () => {
      const dir = join(FIXTURES_DIR, 'json-config/.netlify/functions-internal/')
      const mainFile = join(dir, 'simple.js')
      const func = await listFunction(mainFile, {
        configFileDirectories: [dir],
      })

      expect(func).toEqual({
        displayName: 'A Display Name',
        extension: '.js',
        generator: '@netlify/mock-plugin@1.0.0',
        mainFile,
        name: 'simple',
        runtime: 'js',
        runtimeAPIVersion: undefined,
      })
    })
  })
  describe('v2', () => {
    test('listFunction does not include runtimeAPIVersion when parseISC false', async () => {
      const mainFile = join(FIXTURES_ESM_DIR, 'v2-api/function.js')
      const func = await listFunction(mainFile, {
        parseISC: false,
      })

      expect(func?.runtimeAPIVersion).toBeUndefined()
    })

    test('listFunction includes runtimeAPIVersion when parseISC true', async () => {
      const mainFile = join(FIXTURES_ESM_DIR, 'v2-api/function.js')
      const func = await listFunction(mainFile, {
        parseISC: true,
      })

      expect(func?.runtimeAPIVersion).toBe(2)
    })
  })
})
