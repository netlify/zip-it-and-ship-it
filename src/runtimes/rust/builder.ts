import { readFile } from 'fs'
import { basename, join } from 'path'
import { promisify } from 'util'

import makeDir from 'make-dir'
import tmp from 'tmp-promise'
import toml from 'toml'

import { FunctionConfig } from '../../config'
import { lstat } from '../../utils/fs'
import { runCommand } from '../../utils/shell'
import type { RuntimeName } from '../runtime'

import { CargoManifest } from './cargo_manifest'
import { BUILD_TARGET, MANIFEST_NAME } from './constants'

const pReadFile = promisify(readFile)

const runtimeName: RuntimeName = 'rs'

const build = async ({ config, name, srcDir }: { config: FunctionConfig; name: string; srcDir: string }) => {
  const functionName = basename(srcDir)

  try {
    await installToolchainOnce()
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName, runtime: runtimeName } }

    throw error
  }

  const targetDirectory = await getTargetDirectory({ config, name })

  await cargoBuild({ functionName, srcDir, targetDirectory })

  // By default, the binary will have the same name as the crate and there's no
  // way to override it (https://github.com/rust-lang/cargo/issues/1706). We
  // must extract the crate name from the manifest and use it to form the path
  // to the binary.
  const manifest = await pReadFile(join(srcDir, MANIFEST_NAME), 'utf8')
  const {
    package: { name: packageName },
  }: CargoManifest = toml.parse(manifest)
  const binaryPath = join(targetDirectory, BUILD_TARGET, 'release', packageName)
  const stat = await lstat(binaryPath)

  return {
    path: binaryPath,
    stat,
  }
}

const cargoBuild = async ({
  functionName,
  srcDir,
  targetDirectory,
}: {
  functionName: string
  srcDir: string
  targetDirectory: string
}) => {
  try {
    await runCommand('cargo', ['build', '--target', BUILD_TARGET, '--release'], {
      cwd: srcDir,
      env: {
        CARGO_TARGET_DIR: targetDirectory,
      },
    })
  } catch (error) {
    const hasToolchain = await checkRustToolchain()

    if (hasToolchain) {
      console.error(`Could not compile Rust function ${functionName}:\n`)
    } else {
      error.message =
        'There is no Rust toolchain installed. Visit https://ntl.fyi/missing-rust-toolchain for more information.'
    }

    error.customErrorInfo = { type: 'functionsBundling', location: { functionName, runtime: runtimeName } }

    throw error
  }
}

const checkRustToolchain = async () => {
  try {
    await runCommand('cargo', ['-V'])

    return true
  } catch (_) {
    return false
  }
}

// Returns the path of the Cargo target directory.
const getTargetDirectory = async ({ config, name }: { config: FunctionConfig; name: string }) => {
  const { rustTargetDirectory } = config

  // If the config includes a `rustTargetDirectory` path, we'll use that.
  if (rustTargetDirectory) {
    // We replace the [name] placeholder with the name of the function.
    const path = rustTargetDirectory.replace(/\[name]/g, name)

    await makeDir(path)

    return path
  }

  // If the directory hasn't been configured, we'll use a temporary directory.
  const { path } = await tmp.dir()

  return path
}

let toolchainInstallation: Promise<void>

// Sets the default toolchain and installs the build target defined in
// `BUILD_TARGET`. The Promise is saved to `toolchainInstallation`, so
// that we run the command just once for multiple Rust functions.
const installToolchain = async () => {
  await runCommand('rustup', ['default', 'stable'])
  await runCommand('rustup', ['target', 'add', BUILD_TARGET])
}

const installToolchainOnce = () => {
  if (toolchainInstallation === undefined) {
    toolchainInstallation = installToolchain()
  }

  return toolchainInstallation
}

export { build }
