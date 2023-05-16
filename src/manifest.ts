import { promises as fs } from 'fs'
import { resolve } from 'path'
import { arch, platform } from 'process'

import type { FeatureFlags } from './feature_flags.js'
import type { InvocationMode } from './function.js'
import type { FunctionResult } from './utils/format_result.js'

interface ManifestFunction {
  invocationMode?: InvocationMode
  mainFile: string
  name: string
  path: string
  runtime: string
  runtimeVersion?: string
  schedule?: string
  displayName?: string
  bundler?: string
  generator?: string
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

export const createManifest = async ({
  featureFlags,
  functions,
  path,
}: {
  featureFlags: FeatureFlags
  functions: FunctionResult[]
  path: string
}) => {
  const formattedFunctions = functions.map((func) => formatFunctionForManifest(func, featureFlags))
  const payload: Manifest = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await fs.writeFile(path, JSON.stringify(payload))
}

const formatFunctionForManifest = (
  {
    bundler,
    displayName,
    generator,
    invocationMode,
    mainFile,
    name,
    path,
    runtime,
    runtimeVersion,
    schedule,
  }: FunctionResult,
  featureFlags: FeatureFlags,
): ManifestFunction => ({
  bundler,
  displayName,
  generator,
  invocationMode,
  mainFile,
  name,
  runtimeVersion: featureFlags.functions_inherit_build_nodejs_version ? runtimeVersion : undefined,
  path: resolve(path),
  runtime,
  schedule,
})
