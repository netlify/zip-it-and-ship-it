const { env, platform } = require('process')

/**
 * @template M, O
 * @param {import("ava")} test
 * @param {Record<M, O>} matrix
 * @returns {(name: string, matrix: M[], runner: (opts: O, t: import("ava").ExecutionContext) => any) => void}
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
      const isSerial = variationNames.length >= 3 && platform === 'win32'
      const testFunction = isSerial ? testFn.serial : testFn
      const testTitle = `${title} [${name}]`

      if (name.startsWith('todo:')) {
        testFunction.todo(testTitle)

        return
      }

      const variation = matrix[name]

      if (name === undefined || variation === undefined) {
        throw new Error(`Unknown variation in test: ${name}`)
      }

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
