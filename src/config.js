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
      const starCount = [...expression].filter((char) => char === '*').length

      return {
        expression,
        weight: expression.length - starCount - (starCount ? 1 : 0),
      }
    })
    .sort((fA, fB) => fA.weight - fB.weight)
    .map(({ expression }) => config[expression])

  return mergeOptions.apply({ concatArrays: true }, matches)
}

module.exports = { getConfigForFunction }
