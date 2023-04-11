import { FeatureFlags } from '../../../../feature_flags.js'
import { ModuleFileExtension, ModuleFormat } from '../../utils/module_format.js'
import { DEFAULT_NODE_VERSION, getNodeSupportMatrix, parseVersion } from '../../utils/node_version.js'
import { getClosestPackageJson } from '../../utils/package_json.js'

const versionMap = {
  14: 'node14',
  16: 'node16',
  18: 'node18',
} as const

type VersionValues = (typeof versionMap)[keyof typeof versionMap]

const getBundlerTarget = (suppliedVersion?: string): VersionValues => {
  const version = parseVersion(suppliedVersion)

  if (version && version in versionMap) {
    return versionMap[version as keyof typeof versionMap]
  }

  return versionMap[DEFAULT_NODE_VERSION]
}

const getModuleFormat = async (
  srcDir: string,
  featureFlags: FeatureFlags,
  extension: string,
  configVersion?: string,
): Promise<{ includedFiles: string[]; moduleFormat: ModuleFormat }> => {
  if (featureFlags.zisi_pure_esm_mjs && extension === ModuleFileExtension.MJS) {
    return {
      includedFiles: [],
      moduleFormat: ModuleFormat.ESM,
    }
  }

  if (featureFlags.zisi_pure_esm) {
    const packageJsonFile = await getClosestPackageJson(srcDir)
    const nodeSupport = getNodeSupportMatrix(configVersion)

    if (packageJsonFile?.contents.type === 'module' && nodeSupport.esm) {
      return {
        includedFiles: [packageJsonFile.path],
        moduleFormat: ModuleFormat.ESM,
      }
    }
  }

  return {
    includedFiles: [],
    moduleFormat: ModuleFormat.COMMONJS,
  }
}

export { getBundlerTarget, getModuleFormat }
