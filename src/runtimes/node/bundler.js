const fs = require('fs')
const { basename, extname, join, resolve } = require('path')
const process = require('process')
const { promisify } = require('util')

const esbuild = require('esbuild')
const semver = require('semver')

const { getBundlerTarget } = require('./bundler_target')
const { externalNativeModulesPlugin } = require('./native_modules/plugin')
const { processSourcemap } = require('./sourcemap')

const pUnlink = promisify(fs.unlink)

const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

// esbuild's async build API throws on Node 8.x, so we switch to the sync
// version for that version range.
// eslint-disable-next-line node/no-sync
const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync

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
      target: [nodeTarget],
    })
    const sourcemapPath = getSourcemapPath(metafile.outputs)
    const inputs = Object.keys(metafile.inputs).map((path) => resolve(path))
    const cleanTempFiles = getCleanupFunction(bundlePath, sourcemapPath)

    // esbuild produces a sourcemap with paths relative to the main destination
    // file, which in our case lives in a temporary directory, making the paths
    // useless. We rewrite those paths.
    await processSourcemap({ pathFormat: config.nodeSourcemapPathFormat, sourcemapPath, srcDir })

    return {
      bundlePath,
      cleanTempFiles,
      inputs,
      nativeNodeModules,
      sourcemapPath,
      warnings,
    }
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName: name } }

    throw error
  }
}

const getCleanupFunction = (bundlePath, sourcemapPath) => async () => {
  try {
    await pUnlink(bundlePath)

    if (sourcemapPath) {
      await pUnlink(sourcemapPath)
    }
  } catch (_) {
    // no-op
  }
}

const getSourcemapPath = (outputs) => {
  const relativePath = Object.keys(outputs).find((path) => extname(path) === '.map')

  if (relativePath) {
    return resolve(relativePath)
  }
}

module.exports = { bundleJsFile }
