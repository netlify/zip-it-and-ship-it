import { dirname, normalize } from 'path'

import { getBasePath } from '../../utils/base_path.js'
import type { BundleFunction } from '../types.js'

import { getSrcFiles } from './src_files.js'

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

  return {
    basePath: getBasePath(dirnames),
    includedFiles,
    inputs: srcFiles,
    mainFile,
    moduleFormat: 'cjs',
    srcFiles,
  }
}

const bundler = { bundle, getSrcFiles }

export default bundler
