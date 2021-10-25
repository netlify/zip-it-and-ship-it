const DEFAULT_VERSION = 'node12'

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

  return DEFAULT_VERSION
}

const normalizeVersion = (version?: string) => {
  const match = version && version.match(/^nodejs(.*)$/)

  return match ? match[1] : version
}

export { getBundlerTarget }
