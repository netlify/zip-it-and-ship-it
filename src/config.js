const mergeOptions = require('merge-options')
const minimatch = require('minimatch')

const getConfigForFunction = ({ config, func }) => {
  if (!config) {
    return {}
  }

  // It's safe to mutate the array because it's local to this function.
  // eslint-disable-next-line fp/no-mutating-methods
  const matches = Object.keys(config)
    .filter((expression) => minimatch(func.name, expression))
    .map((expression) => {
      const wildcardCount = [...expression].filter((char) => char === '*').length

      // The weight increases with the number of hardcoded (i.e. non-wildcard)
      // characters — e.g. "netlify" has a higher weight than "net*". We do a
      // subtraction of 1 if there is at least one wildcard character, so that
      // "netlify" has a higher weight than "netlify*".
      const weight = expression.length - wildcardCount - (wildcardCount === 0 ? 0 : 1)

      return {
        expression,
        weight,
      }
    })
    .sort(({ weight: weightA }, { weight: weightB }) => weightA - weightB)
    .map(({ expression }) => config[expression])

  return mergeOptions.apply({ concatArrays: true, ignoreUndefined: true }, matches)
}

module.exports = { getConfigForFunction }
