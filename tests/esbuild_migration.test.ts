/**
 * In the migration of our ESBuild fork to upstream esbuild,
 * we need to ensure that all behaviour of the fork continues to work in
 * upstream esbuild.
 */

import { describe, expect } from 'vitest'

import { zipNode } from './helpers/main.js'
import { testMany } from './helpers/test_many.js'

const esbuildConfigs = ['bundler_esbuild', 'bundler_esbuild_zisi'] as const

describe('ESBuild Migration', () => {
  /**
   * The two most prominent import expressions are:
   *  - require("caniuse-lite/data/regions/"+n+".js")
   *  - require("caniuse-lite/data/features/"+t+".js")
   * Both are within browserslist: https://github.com/browserslist/browserslist/blob/main/node.js
   * And both are not supported by esbuild, neither by our fork nor by upstream.
   **/
  testMany('caniuse-lite', esbuildConfigs, async (opts) => {
    await expect(() => zipNode('caniuse-lite', { opts })).rejects.toThrowError('Unknown region name `DE`.')
  })

  /**
   * This test covers `require("../chunks/" + __webpack_require__.u(chunkId))`,
   * arguably one of the most important patterns for us to support.
   * Surprisingly, this is unsupported in both our fork and upstream?
   * I'll have to look into this more, probably the test is off.
   */
  testMany('webpack chunks', esbuildConfigs, async (opts) => {
    await expect(() => zipNode('webpack-chunks', { opts })).rejects.toThrowError()
  })
})
