import type { Buffer } from 'buffer'

import { detect, Runtime } from 'elf-cam'

import { cachedReadFile, FsCache } from '../utils/fs'

import type { RuntimeName } from './runtime'

// Try to guess the runtime by inspecting the binary file.
const detectBinaryRuntime = async function ({
  fsCache,
  path,
}: {
  fsCache: FsCache
  path: string
}): Promise<RuntimeName | undefined> {
  try {
    const buffer = await cachedReadFile(fsCache, path)

    // We're using the Type Assertion because the `cachedReadFile` abstraction
    // loses part of the return type information. We can safely say it's a
    // Buffer in this case because we're not specifying an encoding.
    const binaryType = detect(buffer as Buffer)

    switch (binaryType) {
      case Runtime.Go:
        return 'go'
      case Runtime.Rust:
        return 'rs'
      default:
        return undefined
    }
  } catch (error) {}
}

export { detectBinaryRuntime }
