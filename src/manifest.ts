import { resolve } from 'path'
import { arch, platform } from 'process'

import { FunctionResult } from './utils/format_result'
import { writeFile } from './utils/fs'

const MANIFEST_VERSION = 1

const createManifest = async ({ functions, path }: { functions: FunctionResult[]; path: string }) => {
  const formattedFunctions = functions.map(formatFunctionForManifest)
  const payload = {
    functions: formattedFunctions,
    system: { arch, platform },
    timestamp: Date.now(),
    version: MANIFEST_VERSION,
  }

  await writeFile(path, JSON.stringify(payload))
}

const formatFunctionForManifest = ({ mainFile, name, path, runtime }: FunctionResult) => ({
  mainFile,
  name,
  path: resolve(path),
  runtime,
})

export { createManifest }
