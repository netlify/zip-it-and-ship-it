const { extname, basename } = require('path')

const { getConfigForFunction } = require('../config')

const goRuntime = require('./go')
const jsRuntime = require('./node')
const rustRuntime = require('./rust')

/**
 * Finds functions for a list of paths using a specific runtime. The return
 * value is an object containing an array of the functions found (`functions`)
 * and an array with the paths that haven't been recognized by the runtime
 * (`remainingPaths`).
 *
 * @param   {Array<String>} paths
 * @param   {Object} runtime
 * @returns {Promise<Object>}
 */
const findFunctionsInRuntime = async function ({ dedupe = false, paths, runtime }) {
  const functions = await runtime.findFunctionsInPaths(paths)

  // If `dedupe` is true, we use the function name (`filename`) as the map key,
  // so that `function-1.js` will overwrite `function-1.go`. Otherwise, we use
  // `srcPath`, so that both functions are returned.
  const key = dedupe ? 'name' : 'srcPath'

  // Augmenting the function objects with additional information.
  const augmentedFunctions = functions.map((func) => [
    func[key],
    {
      ...func,
      extension: extname(func.mainFile),
      filename: basename(func.srcPath),
      runtime,
    },
  ])
  const usedPaths = new Set(augmentedFunctions.map(([path]) => path))
  const remainingPaths = paths.filter((path) => !usedPaths.has(path))

  return { functions: augmentedFunctions, remainingPaths }
}

/**
 * Gets a list of functions found in a list of paths.
 *
 * @param   {Object} config
 * @param   {Boolean} dedupe
 * @param   {String} path
 * @returns {Promise<Map>}
 */
const getFunctionsFromPaths = async (paths, { config, dedupe = false } = {}) => {
  // The order of this array determines the priority of the runtimes. If a path
  // is used by the first time, it won't be made available to the subsequent
  // runtimes.
  const runtimes = [jsRuntime, goRuntime, rustRuntime]

  // We cycle through the ordered array of runtimes, passing each one of them
  // through `findFunctionsInRuntime`. For each iteration, we collect all the
  // functions found plus the list of paths that still need to be evaluated,
  // using them as the input for the next iteration until the last runtime.
  const { functions } = await runtimes.reduce(
    async (aggregate, runtime) => {
      const { functions: aggregateFunctions, remainingPaths: aggregatePaths } = await aggregate
      const { functions: runtimeFunctions, remainingPaths: runtimePaths } = await findFunctionsInRuntime({
        dedupe,
        paths: aggregatePaths,
        runtime,
      })

      return {
        functions: [...aggregateFunctions, ...runtimeFunctions],
        remainingPaths: runtimePaths,
      }
    },
    { functions: [], remainingPaths: paths },
  )
  const functionsWithConfig = functions.map(([name, func]) => [
    name,
    { ...func, config: getConfigForFunction({ config, func }) },
  ])

  return new Map(functionsWithConfig)
}

module.exports = {
  getFunctionsFromPaths,
}
