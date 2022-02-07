// eslint-disable-next-line no-magic-numbers
type SupportedVersionNumbers = 8 | 10 | 12 | 14
type NodeVersion = `${SupportedVersionNumbers}.x` | `nodejs${SupportedVersionNumbers}.x`

// Must match the default version used in Bitballoon.
const DEFAULT_NODE_VERSION = 14
const VERSION_REGEX = /(nodejs)?(\d+)\.x/

const getNodeVersion = (configVersion?: string) => parseVersion(configVersion) ?? DEFAULT_NODE_VERSION

// Takes a string in the format defined by the `NodeVersion` type and returns
// the numeric major version (e.g. "nodejs14.x" => 14).
const parseVersion = (input: string | undefined) => {
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

export { DEFAULT_NODE_VERSION, getNodeVersion, parseVersion, NodeVersion }
