import { extname } from 'path'

import { PackageJson } from './package_json'

const markerModules = ['bindings', 'nan', 'node-gyp', 'node-gyp-build', 'node-pre-gyp', 'prebuild']

const isNativeModule = ({
  binary,
  dependencies = {},
  devDependencies = {},
  files = [],
  gypfile,
}: PackageJson): boolean => {
  if (binary || gypfile) {
    return true
  }

  const hasMarkerModule = markerModules.some((marker) => dependencies[marker] || devDependencies[marker])

  if (hasMarkerModule) {
    return true
  }

  const hasBinaryFile = files.some((path) => !path.startsWith('!') && extname(path) === '.node')

  return hasBinaryFile
}

export { isNativeModule }
