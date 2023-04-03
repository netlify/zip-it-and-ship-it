import { parseVersion } from './node_version.js'

const validRuntimeMap = {
  14: 'nodejs14.x',
  16: 'nodejs16.x',
  18: 'nodejs18.x',
} as const

export const getNodeRuntime = (input: string | undefined): string | undefined => {
  const version = parseVersion(input)

  if (!version || !(version in validRuntimeMap)) {
    return
  }

  return validRuntimeMap[version as keyof typeof validRuntimeMap]
}
