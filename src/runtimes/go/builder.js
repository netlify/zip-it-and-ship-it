const { basename, join } = require('path')

const tmp = require('tmp-promise')

const { lstat } = require('../../utils/fs')
const { runCommand } = require('../../utils/shell')

const build = async ({ directory }) => {
  const functionName = basename(directory)
  const targetDirectory = await tmp.dir({ unsafeCleanup: true })
  const binaryPath = join(targetDirectory.path, functionName)

  try {
    await runCommand('go', ['build', '-o', binaryPath, '-ldflags', '-s -w'], { cwd: directory })
  } catch (error) {
    console.error(`Could not compile Go function ${functionName}:\n`)

    throw error
  }

  const stat = await lstat(binaryPath)

  return {
    mainFile: binaryPath,
    name: functionName,
    srcDir: directory,
    srcPath: binaryPath,
    stat,
  }
}

module.exports = { build }
