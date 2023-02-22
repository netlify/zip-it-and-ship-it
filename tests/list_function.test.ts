import { join } from 'path'

import { describe, expect, test } from 'vitest'

import { listFunction } from '../src/main.js'

import { FIXTURES_DIR } from './helpers/main.js'

describe('listFunction', () => {
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
    })
  })
})
