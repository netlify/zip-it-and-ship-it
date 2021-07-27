const { readFile } = require('fs')
const { basename, join } = require('path')
const { promisify } = require('util')

const pReadFile = promisify(readFile)

const tmp = require('tmp-promise')
const toml = require('toml')

const { lstat } = require('../../utils/fs')
const { runCommand } = require('../../utils/shell')

const { BUILD_TARGET, MANIFEST_NAME } = require('./constants')

const build = async ({ srcDir }) => {
  await installBuildTarget()

  // We compile the binary to a temporary directory so that we don't pollute
  // the user's functions directory.
  const { path: targetDirectory } = await tmp.dir()
  const functionName = basename(srcDir)

  try {
    await runCommand('cargo', ['build', '--target', BUILD_TARGET, '--release'], {
      cwd: srcDir,
      env: {
        CARGO_TARGET_DIR: targetDirectory,
      },
    })
  } catch (error) {
    const hasToolchain = await checkRustToolchain()

    if (!hasToolchain) {
      throw new Error(
        'There is no Rust toolchain installed. Visit https://ntl.fyi/missing-rust-toolchain for more information.',
      )
    }

    console.error(`Could not compile Rust function ${functionName}:\n`)

    throw error
  }

  // By default, the binary will have the same name as the crate and there's no
  // way to override it (https://github.com/rust-lang/cargo/issues/1706). We
  // must extract the crate name from the manifest and use it to form the path
  // to the binary.
  const manifest = await pReadFile(join(srcDir, MANIFEST_NAME))
  const { package } = toml.parse(manifest)
  const binaryPath = join(targetDirectory, BUILD_TARGET, 'release', package.name)
  const stat = await lstat(binaryPath)

  return {
    path: binaryPath,
    stat,
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

let buildTargetInstallation

// Installs the build target defined in `BUILD_TARGET`. The Promise is saved to
// `buildTargetInstallation` so that we run the command just once for multiple
// Rust functions.
const installBuildTarget = () => {
  if (buildTargetInstallation === undefined) {
    buildTargetInstallation = runCommand('rustup', ['target', 'add', BUILD_TARGET])
  }

  return buildTargetInstallation
}

module.exports = { build }
