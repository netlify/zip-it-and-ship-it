const fs = require('fs')
const { basename, extname, join } = require('path')
const { promisify } = require('util')

const esbuild = require('esbuild')

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
  const data = await esbuild.build({
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
