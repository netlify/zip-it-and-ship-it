import { promises as fs } from 'fs'
import { basename } from 'path'

import type { FeatureFlags } from '../../feature_flags.js'
import { FunctionBundlingUserError } from '../../utils/error.js'
import { shellUtils } from '../../utils/shell.js'
import { RUNTIME } from '../runtime.js'

export const build = async ({
  destPath,
  mainFile,
  srcDir,
  featureFlags,
}: {
  destPath: string
  mainFile: string
  srcDir: string
  featureFlags: FeatureFlags
}) => {
  const functionName = basename(srcDir)

  try {
    const args = ['build', '-o', destPath, '-ldflags', '-s -w']

    if (featureFlags.zisi_golang_use_al2) {
      args.push('-tags', 'lambda.norpc')
    }

    await shellUtils.runCommand('go', args, {
      cwd: srcDir,
      env: {
        CGO_ENABLED: '0',
        GOOS: 'linux',
        GOARCH: 'amd64',
      },
    })
  } catch (error) {
    console.error(`Could not compile Go function ${functionName}:\n`)

    throw FunctionBundlingUserError.addCustomErrorInfo(error, { functionName, runtime: RUNTIME.GO })
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
