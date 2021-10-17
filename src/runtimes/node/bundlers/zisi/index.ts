import { dirname, normalize } from 'path'

import type { BundleFunction } from '..'
import { getBasePath } from '../../utils/base_path'

import { getSrcFiles } from './src_files'

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
  const srcFiles = await getSrcFiles({
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

  return {
    basePath: getBasePath(dirnames),
    inputs: srcFiles,
    mainFile,
    srcFiles,
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
