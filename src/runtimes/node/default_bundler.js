const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ZISI } = require('../../utils/consts')

const getDefaultBundler = ({ extension }) => {
  // esbuild is the only option for TypeScript files.
  if (extension === '.ts') {
    return JS_BUNDLER_ESBUILD
  }

  return JS_BUNDLER_ZISI
}

module.exports = { getDefaultBundler }
