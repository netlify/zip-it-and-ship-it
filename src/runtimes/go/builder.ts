import { promises as fs } from 'fs'
import { basename } from 'path'

import { FunctionBundlingUserError } from '../../utils/error.js'
import { shellUtils } from '../../utils/shell.js'

export const build = async ({ destPath, mainFile, srcDir }: { destPath: string; mainFile: string; srcDir: string }) => {
  const functionName = basename(srcDir)

  try {
    await shellUtils.runCommand('go', ['build', '-o', destPath, '-ldflags', '-s -w'], {
      cwd: srcDir,
      env: {
        CGO_ENABLED: '0',
        GOOS: 'linux',
        GOARCH: 'amd64',
      },
    })
  } catch (error) {
    console.error(`Could not compile Go function ${functionName}:\n`)

    throw new FunctionBundlingUserError(error, { functionName, runtime: 'go' })
  }

  const stat = await fs.lstat(destPath)

  return {
    mainFile,
    name: functionName,
    srcDir,
    srcPath: destPath,
    stat,
  }
}
