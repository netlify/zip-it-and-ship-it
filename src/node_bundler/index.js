const fs = require('fs')
const { basename, extname, join } = require('path')
const process = require('process')
const { promisify } = require('util')

const esbuild = require('esbuild')
const semver = require('semver')

const pUnlink = promisify(fs.unlink)

const bundleJsFile = async function ({
  additionalModulePaths,
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

  // esbuild's async build API throws on Node 8.x, so we switch to the sync
  // version for that version range.
  const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

  // eslint-disable-next-line node/no-sync
  const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync
  const data = await buildFunction({
    bundle: true,
    entryPoints: [srcFile],
    external,
    outfile: bundlePath,
    nodePaths: additionalModulePaths,
    platform: 'node',
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

  return { bundlePath, cleanTempFiles, data }
}

module.exports = { bundleJsFile }
