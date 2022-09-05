import { FeatureFlags } from '../../../../feature_flags'
import { ModuleFileExtension, ModuleFormat } from '../../utils/module_format'
import {
  DEFAULT_NODE_VERSION,
  getNodeSupportMatrix,
  NodeVersionString,
  ShortNodeVersionString,
} from '../../utils/node_version'
import { getClosestPackageJson } from '../../utils/package_json'

const versionMap = {
  '8.x': 'node8',
  '10.x': 'node10',
  '12.x': 'node12',
  '14.x': 'node14',
  '16.x': 'node16',
} as const

type VersionValues = typeof versionMap[keyof typeof versionMap]

const getBundlerTarget = (suppliedVersion?: NodeVersionString): VersionValues => {
  const version = normalizeVersion(suppliedVersion)

  if (version && version in versionMap) {
    return versionMap[version]
  }

  return versionMap[`${DEFAULT_NODE_VERSION}.x`]
}

const getModuleFormat = async (
  srcDir: string,
  featureFlags: FeatureFlags,
  extension: string,
  configVersion?: string,
): Promise<{ includedFiles: string[]; moduleFormat: ModuleFormat }> => {
  if (extension === ModuleFileExtension.MJS && featureFlags.zisi_pure_esm_mjs) {
    return {
      includedFiles: [],
      moduleFormat: ModuleFormat.ESM,
    }
  }

  const packageJsonFile = await getClosestPackageJson(srcDir)
  const nodeSupport = getNodeSupportMatrix(configVersion)

  if (featureFlags.zisi_pure_esm && packageJsonFile?.contents.type === 'module' && nodeSupport.esm) {
    return {
      includedFiles: [packageJsonFile.path],
      moduleFormat: ModuleFormat.ESM,
    }
  }

  return {
    includedFiles: [],
    moduleFormat: ModuleFormat.COMMONJS,
  }
}

const normalizeVersion = (version?: NodeVersionString): ShortNodeVersionString | undefined => {
  const match = version && (version.match(/^nodejs(.*)$/) as [string, ShortNodeVersionString])

  return match ? match[1] : (version as ShortNodeVersionString)
}

export { getBundlerTarget, getModuleFormat }
