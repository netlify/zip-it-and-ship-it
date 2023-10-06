import { basename, dirname, join, normalize, resolve, extname } from 'path'

import { nodeFileTrace } from '@vercel/nft'
import resolveDependency from '@vercel/nft/out/resolve-dependency.js'

import type { FunctionConfig } from '../../../../config.js'
import { FeatureFlags } from '../../../../feature_flags.js'
import type { RuntimeCache } from '../../../../utils/cache.js'
import { cachedReadFile, getPathWithExtension } from '../../../../utils/fs.js'
import { minimatch } from '../../../../utils/matching.js'
import { getBasePath } from '../../utils/base_path.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import { MODULE_FORMAT, MODULE_FILE_EXTENSION, tsExtensions, ModuleFormat } from '../../utils/module_format.js'
import { getNodeSupportMatrix } from '../../utils/node_version.js'
import { getClosestPackageJson } from '../../utils/package_json.js'
import type { GetSrcFilesFunction, BundleFunction } from '../types.js'

import { processESM } from './es_modules.js'
import { transpileTS } from './transpile.js'

const appearsToBeModuleName = (name: string) => !name.startsWith('.')

const bundle: BundleFunction = async ({
  basePath,
  cache,
  config,
  featureFlags,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot = basePath,
  runtimeAPIVersion,
}) => {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath || basePath,
  )
  const {
    aliases,
    mainFile: normalizedMainFile,
    moduleFormat,
    paths: dependencyPaths,
    rewrites,
  } = await traceFilesAndTranspile({
    basePath: repositoryRoot,
    cache,
    config,
    featureFlags,
    mainFile,
    pluginsModulesPath,
    name,
    repositoryRoot,
    runtimeAPIVersion,
  })
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)
  const filteredIncludedPaths = [...filterExcludedPaths(dependencyPaths, excludePatterns), ...includedPaths]
  const dirnames = filteredIncludedPaths.map((filePath) => normalize(dirname(filePath))).sort()

  // Sorting the array to make the checksum deterministic.
  const srcFiles = [...filteredIncludedPaths].sort()

  return {
    aliases,
    basePath: getBasePath(dirnames),
    includedFiles: includedPaths,
    inputs: dependencyPaths,
    mainFile: normalizedMainFile,
    moduleFormat,
    rewrites,
    srcFiles,
  }
}

const getIgnoreFunction = (config: FunctionConfig) => {
  const nodeSupport = getNodeSupportMatrix(config.nodeVersion)

  // Paths that will be excluded from the tracing process.
  const ignore = nodeSupport.awsSDKV3 ? ['node_modules/@aws-sdk/**'] : ['node_modules/aws-sdk/**']

  return (path: string) => {
    const shouldIgnore = ignore.some((expression) => minimatch(path, expression))

    return shouldIgnore
  }
}

/**
 * Returns the module format that should be used when transpiling a TypeScript
 * file.
 */
const getTSModuleFormat = async (
  mainFile: string,
  runtimeAPIVersion: number,
  repositoryRoot?: string,
): Promise<ModuleFormat> => {
  // TODO: This check should go away. We should always respect the format from
  // the extension. We'll do this at a later stage, after we roll out the V2
  // API with no side-effects on V1 functions.
  if (runtimeAPIVersion === 2) {
    if (extname(mainFile) === MODULE_FILE_EXTENSION.MTS) {
      return MODULE_FORMAT.ESM
    }

    if (extname(mainFile) === MODULE_FILE_EXTENSION.CTS) {
      return MODULE_FORMAT.COMMONJS
    }
  }

  // At this point, we need to infer the module type from the `type` field in
  // the closest `package.json`.
  try {
    const packageJSON = await getClosestPackageJson(dirname(mainFile), repositoryRoot)

    if (packageJSON?.contents.type === 'module') {
      return MODULE_FORMAT.ESM
    }
  } catch {
    // no-op
  }

  return MODULE_FORMAT.COMMONJS
}

type TypeScriptTransformer = {
  aliases: Map<string, string>
  bundle?: boolean
  format: ModuleFormat
  newMainFile?: string
  rewrites: Map<string, string>
}

const getTypeScriptTransformer = async (
  runtimeAPIVersion: number,
  mainFile: string,
  repositoryRoot?: string,
): Promise<TypeScriptTransformer | undefined> => {
  const isTypeScript = tsExtensions.has(extname(mainFile))

  if (!isTypeScript) {
    return
  }

  const format = await getTSModuleFormat(mainFile, runtimeAPIVersion, repositoryRoot)
  const aliases = new Map<string, string>()
  const rewrites = new Map<string, string>()
  const transformer = {
    aliases,
    format,
    rewrites,
  }

  if (runtimeAPIVersion === 2) {
    // For V2 functions, we want to emit a main file with an unambiguous
    // extension (i.e. `.cjs` or `.mjs`), so that the file is loaded with
    // the correct format regardless of what is set in `package.json`.
    const newExtension = format === MODULE_FORMAT.COMMONJS ? MODULE_FILE_EXTENSION.CJS : MODULE_FILE_EXTENSION.MJS
    const newMainFile = getPathWithExtension(mainFile, newExtension)

    return {
      ...transformer,
      bundle: true,
      newMainFile,
    }
  }

  return transformer
}

const traceFilesAndTranspile = async function ({
  basePath,
  cache,
  config,
  featureFlags,
  mainFile,
  pluginsModulesPath,
  name,
  repositoryRoot,
  runtimeAPIVersion,
}: {
  basePath?: string
  cache: RuntimeCache
  config: FunctionConfig
  featureFlags: FeatureFlags
  mainFile: string
  pluginsModulesPath?: string
  name: string
  repositoryRoot?: string
  runtimeAPIVersion: number
}) {
  const tsTransformer = await getTypeScriptTransformer(runtimeAPIVersion, mainFile, repositoryRoot)
  const {
    fileList: dependencyPaths,
    esmFileList,
    reasons,
  } = await nodeFileTrace([mainFile], {
    // Default is 1024. Allowing double the fileIO in parallel makes nft faster, but uses a little more memory.
    fileIOConcurrency: 2048,
    base: basePath,
    cache: cache.nftCache,
    ignore: getIgnoreFunction(config),
    readFile: async (path: string) => {
      try {
        const extension = extname(path)

        if (tsExtensions.has(extension)) {
          const transpiledSource = await transpileTS({
            bundle: tsTransformer?.bundle,
            config,
            name,
            format: tsTransformer?.format,
            path,
          })
          const isMainFile = path === mainFile

          // If this is the main file, the final path of the compiled file may
          // have been set by the transformer. It's fine to do this, since the
          // only place where this file will be imported from is our entry file
          // and we'll know the right path to use.
          const newPath =
            isMainFile && tsTransformer?.newMainFile
              ? tsTransformer.newMainFile
              : getPathWithExtension(path, MODULE_FILE_EXTENSION.JS)

          // Overriding the contents of the `.ts` file.
          tsTransformer?.rewrites.set(path, transpiledSource)

          // Rewriting the `.ts` path to `.js` in the bundle.
          tsTransformer?.aliases.set(path, newPath)

          return transpiledSource
        }

        return await cachedReadFile(cache.fileCache, path)
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'EISDIR') {
          return null
        }

        throw error
      }
    },
    resolve: async (specifier, parent, ...args) => {
      try {
        return await resolveDependency.default(specifier, parent, ...args)
      } catch (error) {
        // If we get a `MODULE_NOT_FOUND` error for what appears to be a module
        // name, we try to resolve it a second time using `pluginsModulesPath`
        // as the base directory.
        if (error.code === 'MODULE_NOT_FOUND' && pluginsModulesPath && appearsToBeModuleName(specifier)) {
          const newParent = join(pluginsModulesPath, basename(parent))

          return await resolveDependency.default(specifier, newParent, ...args)
        }

        throw error
      }
    },
  })
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )

  if (tsTransformer) {
    return {
      aliases: tsTransformer.aliases,
      mainFile: tsTransformer.newMainFile ?? getPathWithExtension(mainFile, MODULE_FILE_EXTENSION.JS),
      moduleFormat: tsTransformer.format,
      paths: normalizedDependencyPaths,
      rewrites: tsTransformer.rewrites,
    }
  }

  const { moduleFormat, rewrites } = await processESM({
    basePath,
    cache,
    config,
    esmPaths: esmFileList,
    featureFlags,
    mainFile,
    reasons,
    name,
    runtimeAPIVersion,
  })

  return {
    mainFile,
    moduleFormat,
    paths: normalizedDependencyPaths,
    rewrites,
  }
}

const getSrcFiles: GetSrcFilesFunction = async function ({ basePath, config, mainFile }) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const { fileList: dependencyPaths } = await nodeFileTrace([mainFile], {
    base: basePath,
    ignore: getIgnoreFunction(config),
  })
  const normalizedDependencyPaths = [...dependencyPaths].map((path) =>
    basePath ? resolve(basePath, path) : resolve(path),
  )
  const srcFiles = filterExcludedPaths(normalizedDependencyPaths, excludePatterns)
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)

  return {
    srcFiles: [...srcFiles, ...includedPaths],
    includedFiles: includedPaths,
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
