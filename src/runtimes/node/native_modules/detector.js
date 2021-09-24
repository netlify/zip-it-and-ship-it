const markerModules = ['bindings', 'nan', 'node-gyp', 'node-gyp-build', 'node-pre-gyp', 'prebuild']

const isNativeModule = ({ binary, dependencies = {}, devDependencies = {}, gypfile }) =>
  Boolean(binary || gypfile) || markerModules.some((marker) => dependencies[marker] || devDependencies[marker])

module.exports = { isNativeModule }
