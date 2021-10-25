import { dirname, normalize } from 'path'

import type { BundleFunction } from '..'
import type { FunctionConfig } from '../../../../config'
import { getPathWithExtension } from '../../../../utils/fs'
import { nonNullable } from '../../../../utils/non_nullable'
import { getBasePath } from '../../utils/base_path'

import { bundleJsFile } from './bundler'
import { getExternalAndIgnoredModulesFromSpecialCases } from './special_cases'
import { getSrcFiles } from './src_files'

const getFunctionBasePath = ({
  basePathFromConfig,
  mainFile,
  repositoryRoot,
  supportingSrcFiles,
}: {
  basePathFromConfig?: string
  mainFile: string
  repositoryRoot?: string
  supportingSrcFiles: string[]
}) => {
  // If there is a base path defined in the config, we use that. To account for
  // paths outside of `basePathFromConfig` but inside `repositoryRoot`, we use
  // the common path prefix between the two.
  if (basePathFromConfig !== undefined) {
    return getBasePath([basePathFromConfig, repositoryRoot].filter(nonNullable))
  }

  // If not, the base path is the common path prefix between all the supporting
  // files and the main file.
  const dirnames = [...supportingSrcFiles, mainFile].map((filePath) => normalize(dirname(filePath)))

  return getBasePath(dirnames)
}

// Convenience method for retrieving external and ignored modules from
// different places and merging them together.
const getExternalAndIgnoredModules = async ({ config, srcDir }: { config: FunctionConfig; srcDir: string }) => {
  const { externalNodeModules: externalModulesFromConfig = [], ignoredNodeModules: ignoredModulesFromConfig = [] } =
    config
  const { externalModules: externalModulesFromSpecialCases, ignoredModules: ignoredModulesFromSpecialCases } =
    await getExternalAndIgnoredModulesFromSpecialCases({ srcDir })
  const externalModules = [...new Set([...externalModulesFromConfig, ...externalModulesFromSpecialCases])]
  const ignoredModules = [...ignoredModulesFromConfig, ...ignoredModulesFromSpecialCases]

  return { externalModules, ignoredModules }
}

const bundle: BundleFunction = async ({
  basePath,
  config = {},
  extension,
  featureFlags,
  filename,
  mainFile,
  name,
  pluginsModulesPath,
  repositoryRoot,
  runtime,
  srcDir,
  srcPath,
  stat,
}) => {
  const { externalModules, ignoredModules } = await getExternalAndIgnoredModules({ config, srcDir })
  const {
    additionalPaths,
    bundlePaths,
    cleanTempFiles,
    inputs,
    nativeNodeModules = {},
    nodeModulesWithDynamicImports,
    warnings,
  } = await bundleJsFile({
    additionalModulePaths: pluginsModulesPath ? [pluginsModulesPath] : [],
    basePath,
    config,
    externalModules,
    ignoredModules,
    name,
    srcDir,
    srcFile: mainFile,
  })
  const bundlerWarnings = warnings.length === 0 ? undefined : warnings
  const srcFiles = await getSrcFiles({
    basePath,
    config: {
      ...config,
      externalNodeModules: [...externalModules, ...Object.keys(nativeNodeModules)],
      includedFiles: [...(config.includedFiles || []), ...additionalPaths],
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

  // We want to remove `mainFile` from `srcFiles` because it represents the
  // path of the original, pre-bundling function file. We'll add the actual
  // bundled file further below.
  const supportingSrcFiles = srcFiles.filter((path) => path !== mainFile)
  const normalizedMainFile = getPathWithExtension(mainFile, '.js')
  const functionBasePath = getFunctionBasePath({
    basePathFromConfig: basePath,
    mainFile,
    repositoryRoot,
    supportingSrcFiles,
  })

  return {
    aliases: bundlePaths,
    cleanupFunction: cleanTempFiles,
    basePath: functionBasePath,
    bundlerWarnings,
    inputs,
    mainFile: normalizedMainFile,
    nativeNodeModules,
    nodeModulesWithDynamicImports,
    srcFiles: [...supportingSrcFiles, ...bundlePaths.keys()],
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
