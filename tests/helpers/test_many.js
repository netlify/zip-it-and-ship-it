const { platform } = require('process')

const makeTestMany = (test, matrix) => {
  const testBundlers = (title, variationNames, assertions, testFn = test) => {
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
