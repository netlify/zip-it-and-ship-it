import { basename } from 'path'

import { RUNTIME_GO } from '../../utils/consts'
import { lstat } from '../../utils/fs'
import { runCommand } from '../../utils/shell'

const build = async ({ destPath, mainFile, srcDir }: { destPath: string; mainFile: string; srcDir: string }) => {
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

export { build }
