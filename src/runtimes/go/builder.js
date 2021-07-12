const { basename } = require('path')

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
