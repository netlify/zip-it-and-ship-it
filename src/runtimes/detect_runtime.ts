import type { Buffer } from 'buffer'

import { detect, Runtime as BinaryRuntime, Arch, Platform, BinaryInfo } from '@netlify/binary-info'

import { cachedReadFile, FsCache } from '../utils/fs.js'

import { RuntimeType } from './runtime.js'

const isValidFunctionBinary = (info: BinaryInfo) => info.arch === Arch.Amd64 && info.platform === Platform.Linux

const warnIncompatibleBinary = function (path: string, binaryInfo: BinaryInfo): undefined {
  if (!global.ZISI_CLI) {
    console.warn(`
Found incompatible prebuilt function binary in ${path}.
The binary needs to be built for Linux/Amd64, but it was built for ${Platform[binaryInfo.platform]}/${
      Arch[binaryInfo.arch]
    }`)
  }

  return undefined
}

// Try to guess the runtime by inspecting the binary file.
export const detectBinaryRuntime = async function ({
  fsCache,
  path,
}: {
  fsCache: FsCache
  path: string
}): Promise<RuntimeType | undefined> {
  try {
    const buffer = await cachedReadFile(fsCache, path)

    // We're using the Type Assertion because the `cachedReadFile` abstraction
    // loses part of the return type information. We can safely say it's a
    // Buffer in this case because we're not specifying an encoding.
    const binaryInfo = detect(buffer as Buffer)

    if (!isValidFunctionBinary(binaryInfo)) {
      return warnIncompatibleBinary(path, binaryInfo)
    }

    switch (binaryInfo.runtime) {
      case BinaryRuntime.Go:
        return RuntimeType.GO
      case BinaryRuntime.Rust:
        return RuntimeType.RUST
      default:
        return undefined
    }
  } catch {
    // Possible errors are: non binary files, arch/platforms not supported by binary-info, path is directory
  }
}
