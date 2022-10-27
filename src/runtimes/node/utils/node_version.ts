type SupportedVersionNumbers = 8 | 10 | 12 | 14 | 16
export type ShortNodeVersionString = `${SupportedVersionNumbers}.x`
export type NodeVersionString = ShortNodeVersionString | `nodejs${SupportedVersionNumbers}.x`

export interface NodeVersionSupport {
  esm: boolean
}

// Must match the default version used in Bitballoon.
export const DEFAULT_NODE_VERSION = 16
const VERSION_REGEX = /(nodejs)?(\d+)\.x/

export const getNodeVersion = (configVersion?: string) => parseVersion(configVersion) ?? DEFAULT_NODE_VERSION

export const getNodeSupportMatrix = (configVersion?: string): NodeVersionSupport => {
  const versionNumber = getNodeVersion(configVersion)

  return {
    esm: versionNumber >= 14,
  }
}

// Takes a string in the format defined by the `NodeVersion` type and returns
// the numeric major version (e.g. "nodejs14.x" => 14).
export const parseVersion = (input: string | undefined) => {
  if (input === undefined) {
    return
  }

  const match = input.match(VERSION_REGEX)

  if (match === null) {
    return
  }

  const version = Number.parseInt(match[2])

  if (Number.isNaN(version)) {
    return
  }

  return version
}
