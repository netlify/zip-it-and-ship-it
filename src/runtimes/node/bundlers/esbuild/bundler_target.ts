import { FeatureFlags } from '../../../../feature_flags'
import { ModuleFormat } from '../../utils/module_format'
import { DEFAULT_NODE_VERSION, getNodeSupportMatrix } from '../../utils/node_version'
import { getClosestPackageJson } from '../../utils/package_json'

const versionMap = {
  '8.x': 'node8',
  '10.x': 'node10',
  '12.x': 'node12',
  '14.x': 'node14',
} as const

type VersionKeys = keyof typeof versionMap
type VersionValues = typeof versionMap[VersionKeys]

const getBundlerTarget = (suppliedVersion?: string): VersionValues => {
  const version = normalizeVersion(suppliedVersion)

  if (version && version in versionMap) {
    return versionMap[version as VersionKeys]
  }

  return versionMap[`${DEFAULT_NODE_VERSION}.x`]
}

const getModuleFormat = async (
  srcDir: string,
  featureFlags: FeatureFlags,
  configVersion?: string,
): Promise<{ includedFiles: string[]; moduleFormat: ModuleFormat }> => {
  const packageJsonFile = await getClosestPackageJson(srcDir)
  const nodeSupport = getNodeSupportMatrix(configVersion)

  if (featureFlags.zisi_pure_esm && packageJsonFile?.contents.type === 'module' && nodeSupport.esm) {
    return {
      includedFiles: [packageJsonFile.path],
      moduleFormat: 'esm',
    }
  }

  return {
    includedFiles: [],
    moduleFormat: 'cjs',
  }
}

const normalizeVersion = (version?: string) => {
  const match = version && version.match(/^nodejs(.*)$/)

  return match ? match[1] : version
}

export { getBundlerTarget, getModuleFormat }
