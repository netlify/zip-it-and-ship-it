const fs = require('fs')
const { basename, extname, join } = require('path')
const process = require('process')
const { promisify } = require('util')

const esbuild = require('esbuild')
const semver = require('semver')

const { getPlugins } = require('./plugins')

const pUnlink = promisify(fs.unlink)

const bundleJsFile = async function ({
  additionalModulePaths,
  basePath,
  destFilename,
  destFolder,
  externalModules = [],
  ignoredModules = [],
  srcFile,
}) {
  // De-duping external and ignored modules.
  const external = [...new Set([...externalModules, ...ignoredModules])]
  const jsFilename = `${basename(destFilename, extname(destFilename))}.js`
  const bundlePath = join(destFolder, jsFilename)
  const pluginContext = {
    nodeBindings: new Set(),
  }

  // esbuild's async build API throws on Node 8.x, so we switch to the sync
  // version for that version range.
  const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

  // The sync API does not support plugins.
  const plugins = supportsAsyncAPI ? getPlugins({ additionalModulePaths, basePath, context: pluginContext }) : undefined

  // eslint-disable-next-line node/no-sync
  const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync
  const data = await buildFunction({
    bundle: true,
    entryPoints: [srcFile],
    external,
    logLevel: 'silent',
    outfile: bundlePath,
    nodePaths: additionalModulePaths,
    platform: 'node',
    plugins,
    resolveExtensions: ['.js', '.jsx', '.mjs', '.cjs', '.json'],
    target: ['es2017'],
  })
  const cleanTempFiles = async () => {
    try {
      await pUnlink(bundlePath)
    } catch (_) {
      // no-op
    }
  }
  const additionalSrcFiles = [...pluginContext.nodeBindings]

  return { bundlePath, cleanTempFiles, data: { ...data, additionalSrcFiles } }
}

module.exports = { bundleJsFile }
