/**
 * In the migration of our ESBuild fork to upstream esbuild,
 * we need to ensure that all behaviour of the fork continues to work in
 * upstream esbuild.
 */

import { join } from 'path'

import merge from 'deepmerge'
import { describe, expect } from 'vitest'

import { FIXTURES_DIR, importFunctionFile, zipNode } from './helpers/main.js'
import { testMany } from './helpers/test_many.js'

const esbuildConfigs = ['bundler_esbuild', 'bundler_esbuild_zisi'] as const

describe('ESBuild Migration', () => {
  /**
   * The two most prominent import expressions are:
   *  - require("caniuse-lite/data/regions/"+n+".js")
   *  - require("caniuse-lite/data/features/"+t+".js")
   * Both are within browserslist: https://github.com/browserslist/browserslist/blob/main/node.js
   * And both are not supported by esbuild, neither by our fork nor by upstream.
   */
  testMany('caniuse-lite', esbuildConfigs, async (opts) => {
    await expect(() => zipNode('caniuse-lite', { opts })).rejects.toThrowError('Unknown region name `DE`.')
  })

  /**
   * This test covers `require("../chunks/" + __webpack_require__.u(chunkId))`.
   * arguably one of the most important patterns for us to support.
   * It's supported by our ESBuild fork, but not by upstream.
   * This is blocking the migration for now, opened an issue about it:
   * https://github.com/evanw/esbuild/issues/3328
   */
  testMany('webpack chunks', esbuildConfigs, async (options) => {
    const fixtureName = 'webpack-chunks'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await zipNode(fixtureName, { opts })
  })

  /**
   * This test covers `require(`cardinal${REQUIRE_TERMINATOR}`)`.
   */
  testMany('cardinal require terminator', esbuildConfigs, async (opts) => {
    const {
      files: [{ unzipPath, entryFilename }],
    } = await zipNode('cardinal-require-terminator', { opts })
    const res = await importFunctionFile(`${unzipPath}/${entryFilename}`)
    expect(res).toEqual('Cardinal is unavailable!')
  })

  testMany('template strings', esbuildConfigs, async (opts) => {
    await expect(() => zipNode('require-template-string', { opts })).rejects.toThrowError(
      "Cannot find module './languages/FR/regions/PARIS/translations.js'",
    )
  })
})
