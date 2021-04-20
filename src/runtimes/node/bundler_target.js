const DEFAULT_VERSION = 'node12'

const versionMap = {
  '8.x': 'node8',
  '10.x': 'node10',
  '12.x': 'node12',
  '14.x': 'node14',
}

const getBundlerTarget = (suppliedVersion) => {
  const version = normalizeVersion(suppliedVersion)

  return versionMap[version] || DEFAULT_VERSION
}

const normalizeVersion = (version) => {
  const match = version && version.match(/^nodejs(.*)$/)

  return match ? match[1] : version
}

module.exports = { getBundlerTarget }
