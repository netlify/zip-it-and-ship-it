import { dirname, extname, normalize } from 'path'

import { FunctionBundlingUserError } from '../../../../utils/error.js'
import { RuntimeType } from '../../../runtime.js'
import { getBasePath } from '../../utils/base_path.js'
import { filterExcludedPaths, getPathsOfIncludedFiles } from '../../utils/included_files.js'
import { ModuleFormat } from '../../utils/module_format.js'
import { getNodeSupportMatrix } from '../../utils/node_version.js'
import { getPackageJsonIfAvailable } from '../../utils/package_json.js'
import { BundleFunction, GetSrcFilesFunction, NodeBundlerType } from '../types.js'

/**
 * This bundler is a simple no-op bundler, that does no bundling at all.
 * It returns the detected moduleFormat and the mainFile + includedFiles from the config.
 */

/**
 * Mimics the logic from Node.js, as functions with this bundler will be executed as is in Node.js.
 */
const getModuleFormat = async function (mainFile: string): Promise<ModuleFormat> {
  const extension = extname(mainFile)

  if (extension === '.mjs') {
    return ModuleFormat.ESM
  }

  if (extension === '.cjs') {
    return ModuleFormat.COMMONJS
  }

  const packageJson = await getPackageJsonIfAvailable(dirname(mainFile))

  if (packageJson.type === 'module') {
    return ModuleFormat.ESM
  }

  return ModuleFormat.COMMONJS
}

export const getSrcFiles: GetSrcFilesFunction = async function ({ config, mainFile }) {
  const { includedFiles = [], includedFilesBasePath } = config
  const { excludePatterns, paths: includedFilePaths } = await getPathsOfIncludedFiles(
    includedFiles,
    includedFilesBasePath,
  )
  const includedPaths = filterExcludedPaths(includedFilePaths, excludePatterns)

  return { srcFiles: [mainFile, ...includedPaths], includedFiles: includedPaths }
}

const bundle: BundleFunction = async ({
  basePath,
  config,
  extension,
  featureFlags,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  runtime,
  srcDir,
  srcPath,
  stat,
}) => {
  const { srcFiles, includedFiles } = await getSrcFiles({
    basePath,
    config: {
      ...config,
      includedFilesBasePath: config.includedFilesBasePath || basePath,
    },
    extension,
    featureFlags,
    filename,
    mainFile,
    name,
    pluginsModulesPath,
    runtime,
    srcDir,
    srcPath,
    stat,
  })
  const dirnames = srcFiles.map((filePath) => normalize(dirname(filePath)))
  const moduleFormat = await getModuleFormat(mainFile)
  const nodeSupport = getNodeSupportMatrix(config.nodeVersion)

  if (moduleFormat === ModuleFormat.ESM && !nodeSupport.esm) {
    throw new FunctionBundlingUserError(
      `Entrypoint file is an ESM module, but the Node.js version in the config (${config.nodeVersion}) does not support ESM. ESM is supported as of version 14 of Node.js.`,
      {
        functionName: name,
        runtime: RuntimeType.JAVASCRIPT,
        bundler: NodeBundlerType.NONE,
      },
    )
  }

  return {
    basePath: getBasePath(dirnames),
    includedFiles,
    inputs: srcFiles,
    mainFile,
    moduleFormat,
    srcFiles,
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
