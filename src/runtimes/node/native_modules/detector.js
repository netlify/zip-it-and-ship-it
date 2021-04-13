// eslint-disable-next-line complexity
const isNativeModule = ({ binary, dependencies = {}, devDependencies = {}, gypfile }) =>
  Boolean(
    dependencies.bindings ||
      dependencies.prebuild ||
      dependencies.nan ||
      dependencies['node-pre-gyp'] ||
      dependencies['node-gyp-build'] ||
      devDependencies.prebuild ||
      devDependencies['node-pre-gyp'] ||
      devDependencies['node-gyp-build'] ||
      gypfile ||
      binary,
  )

module.exports = { isNativeModule }
