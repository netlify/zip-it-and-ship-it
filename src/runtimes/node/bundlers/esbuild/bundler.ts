import { readFile, writeFile } from 'fs/promises'
import { basename, dirname, extname, resolve, join } from 'path'

import { build, Metafile } from 'esbuild'
import { tmpName } from 'tmp-promise'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { getPathWithExtension, safeUnlink } from '../../../../utils/fs.js'
import { glob } from '../../../../utils/matching.js'
import { RUNTIME } from '../../../runtime.js'
import { getFileExtensionForFormat, MODULE_FORMAT } from '../../utils/module_format.js'
import { NODE_BUNDLER } from '../types.js'

import { getBundlerTarget, getModuleFormat } from './bundler_target.js'
import { getNativeModulesPlugin } from './plugin_native_modules.js'
import { getNodeBuiltinPlugin } from './plugin_node_builtin.js'

// Maximum number of log messages that an esbuild instance will produce. This
// limit is important to avoid out-of-memory errors due to too much data being
// sent in the Go<>Node IPC channel.
export const ESBUILD_LOG_LIMIT = 10

// When resolving imports with no extension (e.g. require('./foo')), these are
// the extensions that esbuild will look for, in this order.
const RESOLVE_EXTENSIONS = ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json']

/**
 * Our own `includedFiles` syntax is slightly different from what esbuild expects as `externals`.
 *
 * Turns !node_modules/test/** into test
 * and !lang/en.* into ./lang/en.*.
 * esbuild can't handle multiple globs in a single pattern, so we resolve them instead.
 */
const includedFilesToEsbuildExternals = async (includedFiles: string[], baseDir: string) => {
  const exclusions = includedFiles
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1))
    // esbuild expects relative paths
    .map((pattern) => `./${pattern}`)
    // esbuild treats * the same as glob treats **, so this replacement is safe
    .map((pattern) => pattern.replace(/\*\*/g, '*').replace(/\*(\\\*)+/g, '*'))

  const result: string[] = []

  for (const pattern of exclusions) {
    // esbuild expects modules to be passed in as module names, not paths
    const nodeModulesMatch = pattern.match(/^\.\/node_modules\/(([^/]+)(\/[^/*]+)?)*/)

    if (nodeModulesMatch !== null) {
      const [, moduleName] = nodeModulesMatch

      result.push(moduleName)
      continue
    }

    const hasMultipleGlobs = pattern.indexOf('*') !== pattern.lastIndexOf('*')

    if (hasMultipleGlobs) {
      const resolved = await glob(pattern, {
        noglobstar: true,
        cwd: baseDir,
      })

      result.push(...resolved)
    } else {
      result.push(pattern)
    }
  }

  return result
}

export const bundleJsFile = async function ({
  additionalModulePaths,
  config,
  externalModules = [],
  featureFlags,
  ignoredModules = [],
  mainFile,
  name,
  srcDir,
  srcFile,
  runtimeAPIVersion,
}: {
  additionalModulePaths?: string[]
  config: FunctionConfig
  externalModules: string[]
  featureFlags: FeatureFlags
  ignoredModules: string[]
  mainFile: string
  name: string
  srcDir: string
  srcFile: string
  runtimeAPIVersion: number
}) {
  // We use a temporary directory as the destination for esbuild files to avoid
  // any naming conflicts with files generated by other functions.
  const targetDirectory = await tmpName()

  // files matching negated patterns, like `!lang/en.*`, should be excluded from the bundle
  const excludedFiles = await includedFilesToEsbuildExternals(config.includedFiles ?? [], srcDir)

  // De-duping external and ignored modules.
  const external = [...new Set([...externalModules, ...ignoredModules, ...excludedFiles])]

  // To be populated by the native modules plugin with the names, versions and
  // paths of any Node modules with native dependencies.
  const nativeNodeModules = {}

  // The list of esbuild plugins to enable for this build.
  const plugins = [getNodeBuiltinPlugin(), getNativeModulesPlugin(nativeNodeModules)]

  // The version of ECMAScript to use as the build target. This will determine
  // whether certain features are transpiled down or left untransformed.
  const nodeTarget = getBundlerTarget(config.nodeVersion)

  // esbuild will format `sources` relative to the sourcemap file, which lives
  // in `destFolder`. We use `sourceRoot` to establish that relation. They are
  // URLs, not paths, so even on Windows they should use forward slashes.
  const sourceRoot = targetDirectory.replace(/\\/g, '/')

  // Configuring the output format of esbuild. The `includedFiles` array we get
  // here contains additional paths to include with the bundle, like the path
  // to a `package.json` with {"type": "module"} in case of an ESM function.
  const { includedFiles: includedFilesFromModuleDetection, moduleFormat } = await getModuleFormat({
    srcDir,
    featureFlags,
    extension: extname(mainFile),
    runtimeAPIVersion,
    configVersion: config.nodeVersion,
  })

  // The extension of the output file.
  const outputExtension = getFileExtensionForFormat(moduleFormat, featureFlags, runtimeAPIVersion)

  // We add this banner so that calls to require() still work in ESM modules, especially when importing node built-ins
  // We have to do this until this is fixed in esbuild: https://github.com/evanw/esbuild/pull/2067
  const esmJSBanner = `
import {createRequire as ___nfyCreateRequire} from "module";
import {fileURLToPath as ___nfyFileURLToPath} from "url";
import {dirname as ___nfyPathDirname} from "path";
let __filename=___nfyFileURLToPath(import.meta.url);
let __dirname=___nfyPathDirname(___nfyFileURLToPath(import.meta.url));
let require=___nfyCreateRequire(import.meta.url);
`

  try {
    const { metafile = { inputs: {}, outputs: {} }, warnings } = await build({
      banner: moduleFormat === MODULE_FORMAT.ESM ? { js: esmJSBanner } : undefined,
      bundle: true,
      entryPoints: [srcFile],
      external,
      format: moduleFormat,
      logLevel: 'warning',
      logLimit: ESBUILD_LOG_LIMIT,
      metafile: true,
      nodePaths: additionalModulePaths,
      outdir: targetDirectory,
      outExtension: { '.js': outputExtension },
      platform: 'node',
      plugins,
      resolveExtensions: RESOLVE_EXTENSIONS,
      sourcemap: Boolean(config.nodeSourcemap),
      sourceRoot,
      target: [nodeTarget],
    })
    const bundlePaths = getBundlePaths({
      destFolder: targetDirectory,
      outputs: metafile.outputs,
      srcFile,
      outputExtension,
    })

    // workaround for https://github.com/evanw/esbuild/issues/3328
    await Promise.all(
      Object.keys(metafile.outputs)
        .filter((filename) => filename.endsWith('.js'))
        .map(async (filename) => {
          const content = await readFile(filename, { encoding: 'utf-8' })

          const updated = content.replace(
            `
var __glob = (map) => (path) => {
  var fn = map[path];
  if (fn)
    return fn();
  throw new Error("Module not found in bundle: " + path);
};
      `.trim(),
            `
var __glob = (map) => (path) => {
  var fn = map[path] || map[path + '.js'] || map[path + '.json'] || map[path + '/index.js'] || map[path + '/index.json'];
  if (fn)
    return fn();
  throw new Error("Module not found in bundle: " + path);
};
            `.trim(),
          )

          await writeFile(filename, updated, { encoding: 'utf-8' })
        }),
    )

    const inputs = Object.keys(metafile.inputs).map((path) => resolve(path))
    const cleanTempFiles = getCleanupFunction([...bundlePaths.keys()])
    const additionalPaths = includedFilesFromModuleDetection

    return {
      additionalPaths,
      bundlePaths,
      cleanTempFiles,
      inputs,
      moduleFormat,
      nativeNodeModules,
      outputExtension,
      warnings,
    }
  } catch (error) {
    throw FunctionBundlingUserError.addCustomErrorInfo(error, {
      functionName: name,
      runtime: RUNTIME.JAVASCRIPT,
      bundler: NODE_BUNDLER.ESBUILD,
    })
  }
}

// Takes the `outputs` object produced by esbuild and returns a Map with the
// absolute paths of the generated files as keys, and the paths that those
// files should take in the generated bundle as values. This is compatible
// with the `aliases` format used upstream.
const getBundlePaths = ({
  destFolder,
  outputExtension,
  outputs,
  srcFile,
}: {
  destFolder: string
  outputs: Metafile['outputs']
  srcFile: string
  outputExtension: string
}) => {
  const bundleFilename = basename(srcFile, extname(srcFile)) + outputExtension
  const mainFileDirectory = dirname(srcFile)
  const bundlePaths: Map<string, string> = new Map()

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
      // Ensuring the main file has the right extension.
      const normalizedSrcFile = getPathWithExtension(srcFile, outputExtension)

      bundlePaths.set(absolutePath, normalizedSrcFile)
    } else if (extension === outputExtension || filename === `${bundleFilename}.map`) {
      bundlePaths.set(absolutePath, join(mainFileDirectory, filename))
    }
  })

  return bundlePaths
}

const getCleanupFunction = (paths: string[]) => async () => {
  await Promise.all(paths.filter(Boolean).map(safeUnlink))
}
