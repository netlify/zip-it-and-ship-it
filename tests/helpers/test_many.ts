import { env } from 'process'

import { TestAPI, describe, test } from 'vitest'

import type { Config } from '../../src/config'
import type { FeatureFlags } from '../../src/feature_flags'
import { NodeBundlerName, NODE_BUNDLER } from '../../src/main'

interface TestRunnerOptions {
  config: Config
  featureFlags?: FeatureFlags
}
type TestRunner = (opts: TestRunnerOptions, variation: string) => Promise<void> | void
type ChainableTestAPI = TestAPI['skip']

type TestMany<M> = (title: string, variations: M[], runner: TestRunner) => void
interface TestManyAPI<M> {
  (title: string, variations: readonly M[], runner: TestRunner): void
  fails: TestMany<M>
  only: TestMany<M>
  concurrent: TestMany<M>
  skip: TestMany<M>
  todo: TestMany<M>
  skipIf: (condition: any) => TestMany<M>
  runIf: (condition: any) => TestMany<M>
}

export const makeTestMany = <M extends string>(
  testAPI: TestAPI,
  matrix: Record<M, () => { config: Config; featureFlags?: FeatureFlags }>,
): TestManyAPI<M | `todo:${M}`> => {
  const filteredVariations = env.ZISI_FILTER_VARIATIONS ? env.ZISI_FILTER_VARIATIONS.split(',') : []

  const testBundlers = (title: string, variations: M[], runner: TestRunner, testFn: ChainableTestAPI = testAPI) => {
    describe(title, () => {
      variations.forEach((name) => {
        if (filteredVariations.length !== 0 && !filteredVariations.includes(name)) {
          return
        }

        if (name.startsWith('todo:')) {
          testFn.todo(name.slice(5))

          return
        }

        if (name === undefined || matrix[name] === undefined) {
          throw new Error(`Unknown variation in test: ${name}`)
        }

        const variation = matrix[name]()

        testFn(name, runner.bind(null, variation, name))
      })
    })
  }

  const testFns = ['fails', 'only', 'concurrent', 'skip', 'todo'] as const

  testFns.forEach((fn) => {
    testBundlers[fn] = ((...args) => testBundlers(...args, testAPI[fn])) as TestMany<M>
  })

  const ifFns = ['skipIf', 'runIf'] as const

  ifFns.forEach((fn) => {
    testBundlers[fn] = (condition: any) => ((...args) => testBundlers(...args, testAPI[fn](condition))) as TestMany<M>
  })

  return testBundlers as TestManyAPI<M | `todo:${M}`>
}

export const getNodeBundlerString = (variation: string): NodeBundlerName => {
  switch (variation) {
    case 'bundler_esbuild':
    case 'bundler_esbuild_zisi':
      return NODE_BUNDLER.ESBUILD

    case 'bundler_nft':
    case 'bundler_default_nft':
      return NODE_BUNDLER.NFT

    case 'bundler_none':
      return NODE_BUNDLER.NONE

    default:
      return NODE_BUNDLER.ZISI
  }
}

// Without none bundler
export const allBundleConfigs = [
  'bundler_default',
  'bundler_esbuild',
  'bundler_esbuild_zisi',
  'bundler_default_nft',
  'bundler_nft',
] as const

// Convenience method for running a test for multiple variations.
export const testMany = makeTestMany(test, {
  bundler_default: () => ({
    config: { '*': { nodeBundler: undefined } },
  }),
  bundler_default_nft: () => ({
    config: { '*': { nodeBundler: undefined } },
    featureFlags: { traceWithNft: true },
  }),
  bundler_esbuild: () => ({
    config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD } },
  }),
  bundler_esbuild_zisi: () => ({
    config: { '*': { nodeBundler: NODE_BUNDLER.ESBUILD_ZISI } },
  }),
  bundler_nft: () => ({
    config: { '*': { nodeBundler: NODE_BUNDLER.NFT } },
  }),
  bundler_none: () => ({
    config: { '*': { nodeBundler: NODE_BUNDLER.NONE } },
  }),
})
