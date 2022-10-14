import { promises as fs } from 'fs'
import { resolve } from 'path'
import { arch, platform } from 'process'

import { FunctionResult } from './utils/format_result.js'

interface ManifestFunction {
  mainFile: string
  name: string
  path: string
  runtime: string
  schedule?: string
  displayName?: string
  bundler?: string
  isInternalFunction?: boolean
}

export interface Manifest {
  functions: ManifestFunction[]
  system: {
    arch: string
    platform: string
  }
  timestamp: number
  version: number
}

const MANIFEST_VERSION = 1

export const createManifest = async ({ functions, path }: { functions: FunctionResult[]; path: string }) => {
  const formattedFunctions = functions.map(formatFunctionForManifest)
  const payload: Manifest = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await fs.writeFile(path, JSON.stringify(payload))
}

const formatFunctionForManifest = ({
  mainFile,
  name,
  path,
  runtime,
  schedule,
  displayName,
  bundler,
  isInternalFunction,
}: FunctionResult): ManifestFunction => ({
  mainFile,
  name,
  path: resolve(path),
  runtime,
  schedule,
  displayName,
  bundler,
  isInternalFunction,
})
