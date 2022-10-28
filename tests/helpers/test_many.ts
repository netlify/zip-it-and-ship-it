import { env } from 'process'

import throat from 'throat'
import { TestAPI, describe, test } from 'vitest'

import type { Config } from '../../src/config'
import type { FeatureFlags } from '../../src/feature_flags'
import { NodeBundlerType } from '../../src/main'

import { getBundlerNameFromConfig } from './main'

const getRateLimitedTestFunction = (originalTestFunction: TestAPI): TestAPI => {
  const rateLimit = env.ZISI_TEST_RATE_LIMIT ? Number.parseInt(env.ZISI_TEST_RATE_LIMIT) : null

  if (rateLimit === null) {
    return originalTestFunction
  }

  // @ts-expect-error throat types cannot handle TestAPI
  return throat(rateLimit, originalTestFunction) as TestAPI
}

interface TestRunnerOptions {
  config: Config
  getCurrentBundlerName: () => NodeBundlerType | undefined
}
type TestRunner = (opts: TestRunnerOptions, variation: string) => Promise<void> | void

type TestMany<M> = (title: string, variations: M[], runner: TestRunner) => void
interface TestManyAPI<M> {
  (title: string, variations: M[], runner: TestRunner): void
  fails: TestMany<M>
  only: TestMany<M>
  concurrent: TestMany<M>
  skip: TestMany<M>
  todo: TestMany<M>
}

export const makeTestMany = <M extends string>(
  testAPI: TestAPI,
  matrix: Record<M, () => { config: Config; featureFlags?: FeatureFlags }>,
  getCurrentBundlerName: (config: Config) => NodeBundlerType | undefined,
): TestManyAPI<M | `todo:${M}`> => {
  const filteredVariations = env.ZISI_FILTER_VARIATIONS ? env.ZISI_FILTER_VARIATIONS.split(',') : []

  const testBundlers = (title: string, variations: M[], runner: TestRunner, testFn: TestAPI = testAPI) => {
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
        ;(variation as TestRunnerOptions).getCurrentBundlerName = getCurrentBundlerName.bind(null, variation.config)

        const rateLimitedTestFn = getRateLimitedTestFunction(testFn)

        rateLimitedTestFn(name, runner.bind(null, variation, name))
      })
    })
  }

  const testFns = ['fails', 'only', 'concurrent', 'skip', 'todo']

  testFns.forEach((fn) => {
    testBundlers[fn] = ((...args) => testBundlers(...args, test[fn])) as TestMany<M>
  })

  return testBundlers as TestManyAPI<M | `todo:${M}`>
}

export const getNodeBundlerString = (variation: string): NodeBundlerType => {
  switch (variation) {
    case 'bundler_esbuild':
    case 'bundler_esbuild_zisi':
      return NodeBundlerType.ESBUILD

    case 'bundler_nft':
    case 'bundler_default_nft':
      return NodeBundlerType.NFT

    case 'bundler_none':
      return NodeBundlerType.NONE

    default:
      return NodeBundlerType.ZISI
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
export const testMany = makeTestMany(
  test,
  {
    bundler_default: () => ({
      config: { '*': { nodeBundler: undefined } },
    }),
    bundler_default_nft: () => ({
      config: { '*': { nodeBundler: undefined } },
      featureFlags: { traceWithNft: true },
    }),
    bundler_esbuild: () => ({
      config: { '*': { nodeBundler: NodeBundlerType.ESBUILD } },
    }),
    bundler_esbuild_zisi: () => ({
      config: { '*': { nodeBundler: NodeBundlerType.ESBUILD_ZISI } },
    }),
    bundler_nft: () => ({
      config: { '*': { nodeBundler: NodeBundlerType.NFT } },
    }),
    bundler_none: () => ({
      config: { '*': { nodeBundler: NodeBundlerType.NONE } },
    }),
  },
  getBundlerNameFromConfig,
)
