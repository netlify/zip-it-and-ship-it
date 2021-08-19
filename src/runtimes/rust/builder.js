const { readFile } = require('fs')
const { basename, join } = require('path')
const { promisify } = require('util')

const pReadFile = promisify(readFile)

const makeDir = require('make-dir')
const tmp = require('tmp-promise')
const toml = require('toml')

const { RUNTIME_RUST } = require('../../utils/consts')
const { lstat } = require('../../utils/fs')
const { runCommand } = require('../../utils/shell')

const { BUILD_TARGET, MANIFEST_NAME } = require('./constants')

const build = async ({ config, name, srcDir }) => {
  const functionName = basename(srcDir)

  try {
    await installBuildTarget()
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName, runtime: RUNTIME_RUST } }

    throw error
  }

  const targetDirectory = await getTargetDirectory({ config, name })

  await cargoBuild({ functionName, srcDir, targetDirectory })

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

const cargoBuild = async ({ functionName, srcDir, targetDirectory }) => {
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

    error.customErrorInfo = { type: 'functionsBundling', location: { functionName, runtime: RUNTIME_RUST } }

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
const getTargetDirectory = async ({ config, name }) => {
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
