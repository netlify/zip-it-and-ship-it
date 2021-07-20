const { basename } = require('path')

const tmp = require('tmp-promise')

const { lstat } = require('../../utils/fs')
const { runCommand } = require('../../utils/shell')

const build = async ({ destPath, mainFile, srcDir }) => {
  const targetDirectory = await tmp.dir()
  const functionName = basename(srcDir)

  try {
    await runCommand('cargo', ['build'], {
      cwd: srcDir,
    })
  } catch (error) {
    console.error(`Could not compile Go function ${functionName}:\n`)

    throw error
  }

  console.log({ targetDirectory })

  //const stat = await lstat(destPath)

  return {
    mainFile,
    name: functionName,
    srcDir,
    srcPath: destPath,
    //stat,
  }
}

module.exports = { build }
