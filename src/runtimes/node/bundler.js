const fs = require('fs')
const { basename, extname, join } = require('path')
const process = require('process')
const { promisify } = require('util')

const esbuild = require('esbuild')
const semver = require('semver')

const { getBundlerTarget } = require('./bundler_target')
const { externalNativeModulesPlugin } = require('./native_modules/plugin')

const pUnlink = promisify(fs.unlink)

const bundleJsFile = async function ({
  additionalModulePaths,
  config,
  destFilename,
  destFolder,
  externalModules = [],
  ignoredModules = [],
  name,
  srcFile,
}) {
  // De-duping external and ignored modules.
  const external = [...new Set([...externalModules, ...ignoredModules])]
  const jsFilename = `${basename(destFilename, extname(destFilename))}.js`
  const bundlePath = join(destFolder, jsFilename)

  // esbuild's async build API throws on Node 8.x, so we switch to the sync
  // version for that version range.
  const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

  // eslint-disable-next-line node/no-sync
  const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync
  const cleanTempFiles = async () => {
    try {
      await pUnlink(bundlePath)
    } catch (_) {
      // no-op
    }
  }

  const nativeNodeModules = {}
  const plugins = [externalNativeModulesPlugin(nativeNodeModules)]
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  try {
    const data = await buildFunction({
      bundle: true,
      entryPoints: [srcFile],
      external,
      logLevel: 'warning',
      outfile: bundlePath,
      nodePaths: additionalModulePaths,
      platform: 'node',
      plugins: supportsAsyncAPI ? plugins : [],
      resolveExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.json'],
      target: [nodeTarget],
    })

    return { bundlePath, cleanTempFiles, data, nativeNodeModules }
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName: name } }

    throw error
  }
}

module.exports = { bundleJsFile }
