import { join } from 'path'

import { describe, expect, test } from 'vitest'

import { listFunctions } from '../src/main.js'

import { FIXTURES_DIR, normalizeFiles } from './helpers/main.js'

describe('listFunctions', () => {
  test('Can list function main files with listFunctions()', async () => {
    const fixtureDir = `${FIXTURES_DIR}/list`
    const functions = await listFunctions(fixtureDir)
    expect(functions).toEqual(
      [
        { schedule: undefined, name: 'test', mainFile: 'test.zip', runtime: 'js', extension: '.zip' },
        { schedule: undefined, name: 'test', mainFile: 'test.js', runtime: 'js', extension: '.js' },
        { schedule: undefined, name: 'five', mainFile: 'five/index.ts', runtime: 'js', extension: '.ts' },
        { schedule: undefined, name: 'four', mainFile: 'four.js/four.js.js', runtime: 'js', extension: '.js' },
        { schedule: undefined, name: 'one', mainFile: 'one/index.js', runtime: 'js', extension: '.js' },
        { schedule: undefined, name: 'two', mainFile: 'two/two.js', runtime: 'js', extension: '.js' },
        { schedule: undefined, name: 'test', mainFile: 'test', runtime: 'go', extension: '' },
      ].map(normalizeFiles.bind(null, fixtureDir)),
    )
  })

  test('Can list function main files from multiple source directories with listFunctions()', async () => {
    const fixtureDir = `${FIXTURES_DIR}/multiple-src-directories`
    const functions = await listFunctions([
      join(fixtureDir, '.netlify', 'internal-functions'),
      join(fixtureDir, 'netlify', 'functions'),
    ])

    expect(functions).toEqual(
      [
        {
          schedule: undefined,
          name: 'function',
          mainFile: '.netlify/internal-functions/function.js',
          runtime: 'js',
          extension: '.js',
        },
        {
          schedule: undefined,
          name: 'function_internal',
          mainFile: '.netlify/internal-functions/function_internal.js',
          runtime: 'js',
          extension: '.js',
        },
        {
          schedule: undefined,
          name: 'function',
          mainFile: 'netlify/functions/function.js',
          runtime: 'js',
          extension: '.js',
        },
        {
          schedule: undefined,
          name: 'function_user',
          mainFile: 'netlify/functions/function_user.js',
          runtime: 'js',
          extension: '.js',
        },
      ].map(normalizeFiles.bind(null, fixtureDir)),
    )
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
})
