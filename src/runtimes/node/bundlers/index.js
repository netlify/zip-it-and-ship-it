const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ZISI } = require('../../../utils/consts')

const esbuildBundler = require('./esbuild')
const zisiBundler = require('./zisi')

const getBundler = (name) => {
  switch (name) {
    case JS_BUNDLER_ESBUILD:
      return esbuildBundler

    case JS_BUNDLER_ZISI:
      return zisiBundler

    default:
      throw new Error(`Unsupported Node bundler: ${name}`)
  }
}

module.exports = { getBundler }
