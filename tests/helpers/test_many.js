const { env } = require('process')

const throat = require('throat')

const getRateLimitedTestFunction = (originalTestFunction) => {
  const rateLimit = Number.parseInt(env.ZISI_TEST_RATE_LIMIT)

  if (Number.isNaN(rateLimit)) {
    return originalTestFunction
  }

  return throat(rateLimit, originalTestFunction)
}

/**
 * @template M
 * @param {import("ava")} test
 * @param {Record<M, { config: import("../../src/config").Config }>} matrix
 * @returns {(name: string, matrix: M[], runner: (opts: { config: import("../../src/config").Config }, t: import("ava").ExecutionContext) => any) => void}
 */
const makeTestMany = (test, matrix) => {
  const filteredVariations = env.ZISI_FILTER_VARIATIONS ? env.ZISI_FILTER_VARIATIONS.split(',') : []

  const testBundlers = (title, variationNames, assertions, testFn = test) => {
    // eslint-disable-next-line complexity
    variationNames.forEach((name) => {
      if (filteredVariations.length !== 0 && !filteredVariations.includes(name)) {
        return
      }

      // Weird workaround to avoid running too many tests in parallel on
      // Windows, which causes problems in the CI.
      const testTitle = `${title} [${name}]`

      if (name.startsWith('todo:')) {
        testFn.todo(testTitle)

        return
      }

      const variation = matrix[name]

      if (name === undefined || variation === undefined) {
        throw new Error(`Unknown variation in test: ${name}`)
      }

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
