const makeTestMany = (test, matrix) => {
  const testBundlers = (title, variationNames, assertions, testFn = test) => {
    variationNames.forEach((name) => {
      const variation = matrix[name]

      if (name === undefined || variation === undefined) {
        throw new Error(`Unknown variation in test: ${name}`)
      }

      const testTitle = `${title} [${name}]`

      testFn(testTitle, assertions.bind(null, variation))
    })
  }

  const testFns = ['failing', 'only', 'serial', 'skip']

  testFns.forEach((fn) => {
    testBundlers[fn] = (...args) => testBundlers(...args, test[fn])
  })

  return testBundlers
}

module.exports = { makeTestMany }
