import { promises as fs } from 'fs'
import { basename } from 'path'

import { FunctionBundlingUserError } from '../../utils/error.js'
import { shellUtils } from '../../utils/shell.js'
import { RuntimeType } from '../runtime.js'

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

    throw FunctionBundlingUserError.addCustomErrorInfo(error, { functionName, runtime: RuntimeType.GO })
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
