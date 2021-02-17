const fs = require('fs')
const { basename, extname, join } = require('path')
const { promisify } = require('util')

const esbuild = require('esbuild')

const pUnlink = promisify(fs.unlink)

const bundleJsFile = function ({
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

  // We use the synchronous entry point of the esbuild API because it's more
  // performant, works with Node 8, and there are no obvious downsides since
  // we don't need to be performing other work simultaneously.
  // See https://esbuild.github.io/api/#js-specific-details.
  //
  // eslint-disable-next-line node/no-sync
  const data = esbuild.buildSync({
    bundle: true,
    entryPoints: [srcFile],
    external,
    outfile: bundlePath,
    nodePaths: additionalModulePaths,
    platform: 'node',
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
