/**
 * In the migration of our ESBuild fork to upstream esbuild,
 * we need to ensure that all behaviour of the fork continues to work in
 * upstream esbuild.
 *
 * This file contains tests for all kinds of dynamic import expressions,
 * which we used to compare the two version.
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
   * They only support relative imports, not absolute ones.
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
   * In the meantime, we found a workaround.
   */
  testMany('webpack chunks', esbuildConfigs, async (options) => {
    const fixtureName = 'webpack-chunks'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await zipNode(fixtureName, { opts })
  })

  /**
   * This is the same test as above, but with a `.cjs` chunk.
   * It works on neither our fork nor upstream.
   */
  testMany('webpack chunks .cjs', esbuildConfigs, async (options) => {
    const fixtureName = 'webpack-chunks-cjs'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await expect(() => zipNode(fixtureName, { opts })).rejects.toThrowError()
  })

  /**
   * This is the same test as above, but with a `.ts` chunk.
   * It works neither on our fork, nor on upstream.
   * Issue: https://github.com/evanw/esbuild/issues/3320
   */
  testMany('webpack chunks .ts', esbuildConfigs, async (options) => {
    const fixtureName = 'webpack-chunks-ts'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
      config: {
        '*': {
          nodeSourcemap: true,
        },
      },
    })
    await expect(() => zipNode(fixtureName, { opts })).rejects.toThrowError()
  })

  /**
   * This is the same test as above, but with a `.json` chunk.
   */
  testMany('webpack chunks .json', esbuildConfigs, async (options) => {
    const fixtureName = 'webpack-chunks-json'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await zipNode(fixtureName, { opts })
  })

  /**
   * This is the same test as above, but with a binary file.
   * It fails on our fork and upstream.
   */
  testMany('webpack chunks .node', esbuildConfigs, async (options) => {
    const fixtureName = 'glob-require-native-module'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await expect(() => zipNode(fixtureName, { opts })).rejects.toThrowError()
  })

  /**
   * This test covers `require(`cardinal${REQUIRE_TERMINATOR}`)`.
   */
  testMany('cardinal require terminator', esbuildConfigs, async (options) => {
    const fixtureName = 'cardinal-require-terminator'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    const {
      files: [{ unzipPath, entryFilename }],
    } = await zipNode(fixtureName, { opts })
    const res = await importFunctionFile(`${unzipPath}/${entryFilename}`)
    expect(res).toEqual('Cardinal is unavailable!')
  })

  /**
   * We're seeing one site do `require(`../../data/${req.params.foo}/${req.params.bar}`)`.
   */
  testMany('template strings', esbuildConfigs, async (options) => {
    const fixtureName = 'require-template-string'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await zipNode(fixtureName, { opts })
  })

  /**
   * If user code defines `__glob` in global scope, esbuild will rename the user symbol, not its helper.
   * Our workaround shouldn't break on this!
   */
  testMany('collision with __glob', esbuildConfigs, async (options) => {
    const fixtureName = 'esbuild-glob'
    const opts = merge(options, {
      basePath: join(FIXTURES_DIR, fixtureName),
    })
    await expect(() => zipNode(fixtureName, { opts })).rejects.toThrowError('__glob go poof')
  })
})
