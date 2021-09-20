const { basename } = require('path')

const { RUNTIME_GO } = require('../../utils/consts')
const { lstat } = require('../../utils/fs')
const { runCommand } = require('../../utils/shell')

const build = async ({ destPath, mainFile, srcDir }) => {
  const functionName = basename(srcDir)

  try {
    await runCommand('go', ['build', '-o', destPath, '-ldflags', '-s -w'], {
      cwd: srcDir,
      env: {
        CGO_ENABLED: '0',
        GOOS: 'linux',
      },
    })
  } catch (error) {
    error.customErrorInfo = { type: 'functionsBundling', location: { functionName, runtime: RUNTIME_GO } }

    console.error(`Could not compile Go function ${functionName}:\n`)

    throw error
  }

  const stat = await lstat(destPath)

  return {
    mainFile,
    name: functionName,
    srcDir,
    srcPath: destPath,
    stat,
  }
}

module.exports = { build }
