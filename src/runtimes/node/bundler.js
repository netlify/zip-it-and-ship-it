const { basename, dirname, extname, join, resolve } = require('path')
const process = require('process')

const esbuild = require('esbuild')
const semver = require('semver')

const { safeUnlink } = require('../../utils/fs')

const { getBundlerTarget } = require('./bundler_target')
const { getModulesWithDynamicImports } = require('./dynamic_imports')
const { externalNativeModulesPlugin } = require('./native_modules/plugin')

const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

// esbuild's async build API throws on Node 8.x, so we switch to the sync
// version for that version range.
// eslint-disable-next-line node/no-sync
const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync

// eslint-disable-next-line max-statements
const bundleJsFile = async function ({
  additionalModulePaths,
  config,
  destFilename,
  destFolder,
  externalModules = [],
  ignoredModules = [],
  name,
  srcDir,
  srcFile,
}) {
  // De-duping external and ignored modules.
  const external = [...new Set([...externalModules, ...ignoredModules])]
  const jsFilename = `${basename(destFilename, extname(destFilename))}.js`
  const bundlePath = join(destFolder, jsFilename)
  const nativeNodeModules = {}
  const plugins = [externalNativeModulesPlugin(nativeNodeModules)]
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  // esbuild will format `sources` relative to the sourcemap file, which is a
  // sibling of `bundlePath`. We use `sourceRoot` to establish that relation.
  // They are URLs, so even on Windows they should use forward slashes.
  const sourceRoot = dirname(bundlePath).replace(/\\/g, '/')

  try {
    const { metafile, warnings } = await buildFunction({
      bundle: true,
      entryPoints: [srcFile],
      external,
      logLevel: 'warning',
      metafile: true,
      nodePaths: additionalModulePaths,
      outfile: bundlePath,
      platform: 'node',
      plugins: supportsAsyncAPI ? plugins : [],
      resolveExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.json'],
      sourcemap: Boolean(config.nodeSourcemap),
      sourceRoot,
      target: [nodeTarget],
    })
    const sourcemapPath = getSourcemapPath(metafile.outputs)
    const inputs = Object.keys(metafile.inputs).map((path) => resolve(path))
    const cleanTempFiles = getCleanupFunction(bundlePath, sourcemapPath)
    const nodeModulesWithDynamicImports = await getModulesWithDynamicImports({ srcDir, warnings })

    return {
      bundlePath,
      cleanTempFiles,
      inputs,
      nativeNodeModules,
      nodeModulesWithDynamicImports,
      sourcemapPath,
      warnings,
    }
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName: name } }

    throw error
  }
}

const getCleanupFunction =
  (...paths) =>
  async () => {
    await Promise.all(paths.filter(Boolean).map(safeUnlink))
  }

const getSourcemapPath = (outputs) => {
  const relativePath = Object.keys(outputs).find((path) => extname(path) === '.map')

  if (relativePath) {
    return resolve(relativePath)
  }
}

module.exports = { bundleJsFile }
