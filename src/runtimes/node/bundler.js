const { basename, dirname, extname, resolve, join } = require('path')
const process = require('process')

const esbuild = require('@netlify/esbuild')
const semver = require('semver')

const { getPathWithExtension, safeUnlink } = require('../../utils/fs')

const { getBundlerTarget } = require('./bundler_target')
const { getDynamicImportsPlugin } = require('./dynamic_imports/plugin')
const { getNativeModulesPlugin } = require('./native_modules/plugin')

const resolveExtensions = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.json']
const supportsAsyncAPI = semver.satisfies(process.version, '>=9.x')

// esbuild's async build API throws on Node 8.x, so we switch to the sync
// version for that version range.
// eslint-disable-next-line node/no-sync
const buildFunction = supportsAsyncAPI ? esbuild.build : esbuild.buildSync

const bundleJsFile = async function ({
  additionalModulePaths,
  basePath,
  config,
  destFolder,
  externalModules = [],
  ignoredModules = [],
  name,
  srcDir,
  srcFile,
}) {
  // De-duping external and ignored modules.
  const external = [...new Set([...externalModules, ...ignoredModules])]

  // To be populated by the native modules plugin with the names, versions and
  // paths of any Node modules with native dependencies.
  const nativeNodeModules = {}

  // To be populated by the dynamic imports plugin with the names of the Node
  // modules that include imports with dynamic expressions.
  const nodeModulesWithDynamicImports = new Set()

  // To be populated by the dynamic imports plugin with any paths (in a glob
  // format) to be included in the bundle in order to make a dynamic import
  // work at runtime.
  const dynamicImportsIncludedPaths = new Set()

  // The list of esbuild plugins to enable for this build.
  const plugins = [
    getNativeModulesPlugin(nativeNodeModules),
    getDynamicImportsPlugin({
      basePath,
      includedPaths: dynamicImportsIncludedPaths,
      moduleNames: nodeModulesWithDynamicImports,
      srcDir,
    }),
  ]

  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  // esbuild will format `sources` relative to the sourcemap file, which lives
  // in `destFolder`. We use `sourceRoot` to establish that relation. They are
  // URLs, not paths, so even on Windows they should use forward slashes.
  const sourceRoot = destFolder.replace(/\\/g, '/')

  try {
    const { metafile, warnings } = await buildFunction({
      bundle: true,
      entryPoints: [srcFile],
      external,
      logLevel: 'warning',
      metafile: true,
      nodePaths: additionalModulePaths,
      outdir: destFolder,
      platform: 'node',
      plugins: supportsAsyncAPI ? plugins : [],
      resolveExtensions,
      sourcemap: Boolean(config.nodeSourcemap),
      sourceRoot,
      target: [nodeTarget],
    })
    const bundlePaths = getBundlePaths({
      destFolder,
      outputs: metafile.outputs,
      srcFile,
    })
    const inputs = Object.keys(metafile.inputs).map((path) => resolve(path))
    const cleanTempFiles = getCleanupFunction([...bundlePaths.keys()])

    return {
      additionalPaths: [...dynamicImportsIncludedPaths],
      bundlePaths,
      cleanTempFiles,
      inputs,
      nativeNodeModules,
      nodeModulesWithDynamicImports: [...nodeModulesWithDynamicImports],
      warnings,
    }
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName: name } }

    throw error
  }
}

// Takes the `outputs` object produced by esbuild and returns a Map with the
// absolute paths of the generated files as keys, and the paths that those
// files should take in the generated bundle as values. This is compatible
// with the `aliases` format used upstream.
const getBundlePaths = ({ destFolder, outputs, srcFile }) => {
  const bundleFilename = `${basename(srcFile, extname(srcFile))}.js`
  const mainFileDirectory = dirname(srcFile)
  const bundlePaths = new Map()

  // The paths returned by esbuild are relative to the current directory, which
  // is a problem on Windows if the target directory is in a different drive
  // letter. To get around that, instead of using `path.resolve`, we compute
  // the absolute path by joining `destFolder` with the `basename` of each
  // entry of the `outputs` object.
  Object.entries(outputs).forEach(([path, output]) => {
    const filename = basename(path)
    const extension = extname(path)
    const absolutePath = join(destFolder, filename)

    if (output.entryPoint && basename(output.entryPoint) === basename(srcFile)) {
      // Ensuring the main file has a `.js` extension.
      const normalizedSrcFile = getPathWithExtension(srcFile, '.js')

      bundlePaths.set(absolutePath, normalizedSrcFile)
    } else if (extension === '.js' || filename === `${bundleFilename}.map`) {
      bundlePaths.set(absolutePath, join(mainFileDirectory, filename))
    }
  })

  return bundlePaths
}

const getCleanupFunction = (paths) => async () => {
  await Promise.all(paths.filter(Boolean).map(safeUnlink))
}

module.exports = { bundleJsFile }
