// Apply the Node.js module logic recursively on its own dependencies, using
// the `package.json` `dependencies`, `peerDependencies` and
// `optionalDependencies` keys
const getNestedDependencies = function ({ dependencies = {}, peerDependencies = {}, optionalDependencies = {} }) {
  return [
    ...Object.keys(dependencies),
    ...Object.keys(peerDependencies).filter(shouldIncludePeerDependency),
    ...Object.keys(optionalDependencies),
  ]
}

// Workaround for https://github.com/netlify/zip-it-and-ship-it/issues/73
// TODO: remove this after adding proper modules exclusion as outlined in
// https://github.com/netlify/zip-it-and-ship-it/issues/68
const shouldIncludePeerDependency = function (name) {
  return !EXCLUDED_PEER_DEPENDENCIES.has(name)
}

const EXCLUDED_PEER_DEPENDENCIES = new Set(['@prisma/cli', 'prisma2'])

// Modules can be required conditionally (inside an `if` or `try`/`catch` block).
// When a `require()` statement is found but the module is not found, it is
// possible that that block either always evaluates to:
//  - `false`: in which case, we should not bundle the dependency
//  - `true`: in which case, we should report the dependency as missing
// Those conditional modules might be:
//  - present in the `package.json` `dependencies`
//  - present in the `package.json` `optionalDependencies`
//  - present in the `package.json` `peerDependencies`
//  - not present in the `package.json`, if the module author wants its users
//    to explicitly install it as an optional dependency.
// The current implementation:
//  - when parsing `require()` statements inside function files, always consider
//    conditional modules to be included, i.e. report them if not found.
//    This is because our current parsing logic does not know whether a
//    `require()` is conditional or not.
//  - when parsing module dependencies, ignore `require()` statements if not
//    present in the `package.json` `*dependencies`. I.e. user must manually
//    install them if the module is used.
// `optionalDependencies`:
//  - are not reported when missing
//  - are included in module dependencies
const handleModuleNotFound = function ({ error, moduleName, packageJson }) {
  if (error.code === 'MODULE_NOT_FOUND' && isOptionalModule(moduleName, packageJson)) {
    return []
  }

  throw error
}

const isOptionalModule = function (
  moduleName,
  { optionalDependencies = {}, peerDependenciesMeta = {}, peerDependencies = {} },
) {
  return (
    optionalDependencies[moduleName] !== undefined ||
    (peerDependenciesMeta[moduleName] &&
      peerDependenciesMeta[moduleName].optional &&
      peerDependencies[moduleName] !== undefined)
  )
}

module.exports = { getNestedDependencies, handleModuleNotFound }
