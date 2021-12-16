import { resolve } from 'path'
import { arch, platform } from 'process'

import { FunctionResult } from './utils/format_result'
import { writeFile } from './utils/fs'

interface ManifestFunction {
  mainFile: string
  name: string
  path: string
  runtime: string
  schedule?: string
}

interface Manifest {
  functions: ManifestFunction[]
  system: {
    arch: string
    platform: string
  }
  timestamp: number
  version: number
}

const MANIFEST_VERSION = 1

const createManifest = async ({ functions, path }: { functions: FunctionResult[]; path: string }) => {
  const formattedFunctions = functions.map(formatFunctionForManifest)
  const payload: Manifest = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await writeFile(path, JSON.stringify(payload))
}

const formatFunctionForManifest = ({ mainFile, name, path, runtime, schedule }: FunctionResult): ManifestFunction => ({
  mainFile,
  name,
  path: resolve(path),
  runtime,
  schedule,
})

export { createManifest }
export type { Manifest }
