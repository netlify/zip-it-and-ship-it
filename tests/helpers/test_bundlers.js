const makeTestBundlers = (test) => {
  const testBundlers = (title, bundlers, assertions, testFn = test) => {
    bundlers.forEach((bundler) => {
      const testTitle = bundler ? `${title} [JS bundler: ${bundler}]` : title

      testFn(testTitle, assertions.bind(null, bundler))
    })
  }

  const testFns = ['failing', 'only', 'serial', 'skip']

  testFns.forEach((fn) => {
    testBundlers[fn] = (...args) => testBundlers(...args, test[fn])
  })

  return testBundlers
}

module.exports = { makeTestBundlers }
