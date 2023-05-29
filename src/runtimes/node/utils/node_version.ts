import semver from 'semver'

export interface NodeVersionSupport {
  esm: boolean
}

// Must match the default version used in Bitballoon.
export const DEFAULT_NODE_VERSION = 18

export const getNodeVersion = (configVersion?: string) => parseVersion(configVersion) ?? DEFAULT_NODE_VERSION

export const getNodeSupportMatrix = (configVersion?: string): NodeVersionSupport => {
  const versionNumber = getNodeVersion(configVersion)

  return {
    esm: versionNumber >= 14,
  }
}

// Takes a string in the format defined by the `NodeVersion` type and returns
// the numeric major version (e.g. "nodejs14.x" => 14).
export const parseVersion = (input: string | undefined): number | undefined => {
  if (input === undefined) {
    return
  }

  return semver.coerce(input)?.major
}
