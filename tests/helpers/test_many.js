const { platform } = require('process')

const minimatch = require('minimatch')

/**
 * @param {string[]} variationNames
 * @param {string[]} patterns
 * @returns {string[]}
 */
const matchVariations = (variationNames, patterns) =>
  variationNames.filter((variationName) => patterns.some((pattern) => minimatch(variationName, pattern)))

/**
 * @template M, O
 * @param {import("ava")} test
 * @param {Record<M, O>} matrix
 * @returns {(name: string, matrix: import("./globify").Globify<M>[], runner: (opts: O, t: import("ava").ExecutionContext) => any) => void}
 */
const makeTestMany = (test, matrix) => {
  const testBundlers = (title, patterns, assertions, testFn = test) => {
    const variationNames = matchVariations(Object.keys(matrix), patterns)
    variationNames.forEach((name) => {
      const variation = matrix[name]

      if (name === undefined || variation === undefined) {
        throw new Error(`Unknown variation in test: ${name}`)
      }

      const testTitle = `${title} [${name}]`

      // Weird workaround to avoid running too many tests in parallel on
      // Windows, which causes problems in the CI.
      const isSerial = variationNames.length >= 3 && platform === 'win32'
      const testFunction = isSerial ? testFn.serial : testFn

      testFunction(testTitle, assertions.bind(null, variation))
    })
  }

  const testFns = ['failing', 'only', 'serial', 'skip']

  testFns.forEach((fn) => {
    testBundlers[fn] = (...args) => testBundlers(...args, test[fn])
  })

  return testBundlers
}

module.exports = { makeTestMany }
