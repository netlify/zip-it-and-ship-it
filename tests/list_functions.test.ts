import { join } from 'path'

import { describe, expect, test } from 'vitest'

import { listFunctions } from '../src/main.js'

import { FIXTURES_DIR, normalizeFiles } from './helpers/main.js'

describe('listFunctions', () => {
  test('Can list function main files with listFunctions()', async () => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const functions = await listFunctions(fixtureDir)

    expect(functions.map((file) => normalizeFiles(fixtureDir, file))).toMatchSnapshot()
  })

  test('Can list function main files from multiple source directories with listFunctions()', async () => {
    const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
    const functions = await listFunctions([
      join(fixtureDir, '.netlify', 'internal-functions'),
      join(fixtureDir, 'netlify', 'functions'),
    ])

    expect(functions.map((file) => normalizeFiles(fixtureDir, file))).toMatchSnapshot()
  })

  test('listFunctions surfaces schedule config property', async () => {
    const functions = await listFunctions(join(FIXTURES_DIR, 'many-functions'), {
      config: {
        five: {
          schedule: '@daily',
        },
      },
    })
    const five = functions.find((func) => func.name === 'five')
    expect(five?.schedule).toBe('@daily')
  })

  test('listFunctions includes in-source config declarations', async () => {
    const functions = await listFunctions(join(FIXTURES_DIR, 'in-source-config', 'functions'), {
      parseISC: true,
    })
    const FUNCTIONS_COUNT = 13
    expect(functions.length).toBe(FUNCTIONS_COUNT)
    functions.forEach((func) => {
      expect(func.schedule).toBe('@daily')
    })
  })

  test('listFunctions includes json configured functions with configured properties', async () => {
    const dir = join(FIXTURES_DIR, 'json-config/.netlify/functions-internal/')
    const [func] = await listFunctions([dir], {
      configFileDirectories: [dir],
    })

    expect(func.displayName).toBe('A Display Name')
    expect(func.generator).toBe('@netlify/mock-plugin@1.0.0')
  })
})
