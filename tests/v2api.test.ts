import { version as nodeVersion } from 'process'

import merge from 'deepmerge'
import semver from 'semver'
import { afterEach, describe, expect, vi } from 'vitest'

import { ENTRY_FILE_NAME } from '../src/runtimes/node/utils/entry_file.js'

import { invokeLambda } from './helpers/lambda.js'
import { zipFixture, unzipFiles, importFunctionFile } from './helpers/main.js'
import { testMany } from './helpers/test_many.js'

vi.mock('../src/utils/shell.js', () => ({ shellUtils: { runCommand: vi.fn() } }))

describe.runIf(semver.gte(nodeVersion, '18.13.0'))('V2 functions API', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  testMany(
    'Handles a basic JavaScript function',
    ['bundler_default', 'todo:bundler_esbuild', 'todo:bundler_esbuild_zisi', 'bundler_default_nft', 'bundler_nft'],
    async (options) => {
      const { files } = await zipFixture('v2-api', {
        opts: merge(options, { featureFlags: { zisi_functions_api_v2: true } }),
      })
      const unzippedFunctions = await unzipFiles(files)

      const func = await importFunctionFile(`${unzippedFunctions[0].unzipPath}/${ENTRY_FILE_NAME}.mjs`)
      const { body, headers = {}, statusCode } = await invokeLambda(func)

      expect(body).toBe('<h1>Hello world</h1>')
      expect(headers['content-type']).toBe('text/html')
      expect(statusCode).toBe(200)
    },
  )
})
