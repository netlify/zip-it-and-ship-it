const { join } = require('path')

const cpFile = require('cp-file')

const { JS_BUNDLER_ESBUILD, JS_BUNDLER_ESBUILD_ZISI, JS_BUNDLER_ZISI, RUNTIME_JS } = require('../../utils/consts')

const { findFunctionsInPaths } = require('./finder')
const { getSrcFiles } = require('./src_files')
const { zipEsbuild } = require('./zip_esbuild')
const { zipZisi } = require('./zip_zisi')

// We use ZISI as the default bundler until the next major release, with the
// exception of TypeScript files, for which the only option is esbuild.
const getDefaultBundler = ({ extension }) => (extension === '.ts' ? JS_BUNDLER_ESBUILD : JS_BUNDLER_ZISI)

const zipFunction = async function ({
  archiveFormat,
  config = {},
  destFolder,
  extension,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  srcDir,
  srcPath,
  stat,
}) {
  const bundler = config.nodeBundler || getDefaultBundler({ extension })

  // If the file is a zip, we assume the function is bundled and ready to go.
  // We simply copy it to the destination path with no further processing.
  if (extension === '.zip') {
    const destPath = join(destFolder, filename)
    await cpFile(srcPath, destPath)
    return { config, path: destPath }
  }

  if (bundler === JS_BUNDLER_ZISI) {
    return zipZisi({
      archiveFormat,
      config,
      destFolder,
      extension,
      filename,
      mainFile,
      pluginsModulesPath,
      srcDir,
      srcPath,
      stat,
    })
  }

  return zipEsbuild({
    archiveFormat,
    config,
    destFolder,
    extension,
    filename,
    mainFile,
    name,
    pluginsModulesPath,
    srcDir,
    srcPath,
    stat,
  })
}

const zipWithFunctionWithFallback = async ({ config = {}, ...parameters }) => {
  // If a specific JS bundler version is specified, we'll use it.
  if (config.nodeBundler !== JS_BUNDLER_ESBUILD_ZISI) {
    return zipFunction({ ...parameters, config })
  }

  // Otherwise, we'll try to bundle with esbuild and, if that fails, fallback
  // to zisi.
  try {
    return await zipFunction({ ...parameters, config: { ...config, nodeBundler: JS_BUNDLER_ESBUILD } })
  } catch (esbuildError) {
    try {
      const data = await zipFunction({ ...parameters, config: { ...config, nodeBundler: JS_BUNDLER_ZISI } })

      return { ...data, bundlerErrors: esbuildError.errors }
    } catch (zisiError) {
      throw esbuildError
    }
  }
}

module.exports = { findFunctionsInPaths, getSrcFiles, name: RUNTIME_JS, zipFunction: zipWithFunctionWithFallback }
