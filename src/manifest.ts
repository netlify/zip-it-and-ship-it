import { promises as fs } from 'fs'
import { resolve } from 'path'
import { arch, platform } from 'process'

import type { InvocationMode } from './function.js'
import type { FunctionResult } from './utils/format_result.js'
import type { Route } from './utils/routes.js'

interface ManifestFunction {
  buildData?: Record<string, unknown>
  invocationMode?: InvocationMode
  mainFile: string
  name: string
  path: string
  routes?: Route[]
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

export const createManifest = async ({ functions, path }: { functions: FunctionResult[]; path: string }) => {
  const formattedFunctions = functions.map((func) => formatFunctionForManifest(func))
  const payload: Manifest = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await fs.writeFile(path, JSON.stringify(payload))
}

const formatFunctionForManifest = ({
  bundler,
  displayName,
  generator,
  invocationMode,
  mainFile,
  name,
  path,
  routes,
  runtime,
  runtimeVersion,
  runtimeAPIVersion,
  schedule,
}: FunctionResult): ManifestFunction => {
  const manifestFunction: ManifestFunction = {
    bundler,
    displayName,
    generator,
    invocationMode,
    buildData: { runtimeAPIVersion },
    mainFile,
    name,
    runtimeVersion,
    path: resolve(path),
    runtime,
    schedule,
  }

  if (routes?.length !== 0) {
    manifestFunction.routes = routes
  }

  return manifestFunction
}
