const { removeFalsy } = require('./remove_falsy')

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (result) => {
  const {
    bundler,
    bundlerErrors,
    bundlerWarnings,
    config = {},
    inputs,
    mainFile,
    name,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path,
    runtime,
    size,
  } = result

  return removeFalsy({
    bundler,
    bundlerErrors,
    bundlerWarnings,
    config,
    inputs,
    mainFile,
    name,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    path,
    runtime: runtime.name,
    size,
  })
}

module.exports = { formatZipResult }
