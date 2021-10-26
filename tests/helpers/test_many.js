const { env } = require('process')

const minimatch = require('minimatch')
const throat = require('throat')

const getRateLimitedTestFunction = (originalTestFunction) => {
  const rateLimit = Number.parseInt(env.ZISI_TEST_RATE_LIMIT)

  if (Number.isNaN(rateLimit)) {
    return originalTestFunction
  }

  return throat(rateLimit, originalTestFunction)
}

/**
 * @param {string[]} variationNames
 * @param {string[]} patterns
 * @returns {string[]}
 */
const matchVariations = (variationNames, patterns) =>
  variationNames.filter((variationName) => patterns.some((pattern) => minimatch(variationName, pattern)))

/**
 * @template M
 * @param {import("ava")} test
 * @param {Record<M, { config: import("../../src/config").Config }>} matrix
 * @returns {(name: string, matrix: import("./globify").Globify<M>[], runner: (opts: { config: import("../../src/config").Config }, t: import("ava").ExecutionContext) => any) => void}
 */
const makeTestMany = (test, matrix) => {
  const filteredVariations = env.ZISI_FILTER_VARIATIONS ? env.ZISI_FILTER_VARIATIONS.split(',') : []

  const testBundlers = (title, patterns, assertions, testFn = test) => {
    const variationNames = matchVariations(Object.keys(matrix), patterns)

    variationNames
      .filter((name) => !filteredVariations.includes(name))
      .forEach((name) => {
        const testTitle = `${title} [${name}]`

        if (name.startsWith('todo:')) {
          testFn.todo(testTitle)

          return
        }

        const variation = matrix[name]

        if (name === undefined || variation === undefined) {
          throw new Error(`Unknown variation in test: ${name}`)
        }

        // Weird workaround to avoid running too many tests in parallel on
        // Windows, which causes problems in the CI.
        const rateLimitedTestFn = getRateLimitedTestFunction(testFn)

        rateLimitedTestFn(testTitle, assertions.bind(null, variation), name)
      })
  }

  const testFns = ['failing', 'only', 'serial', 'skip']

  testFns.forEach((fn) => {
    testBundlers[fn] = (...args) => testBundlers(...args, test[fn])
  })

  return testBundlers
}

module.exports = { makeTestMany }
