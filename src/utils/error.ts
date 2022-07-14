import { NodeBundlerName } from '../runtimes/node/bundlers'
import { RuntimeName } from '../runtimes/runtime'

interface CustomErrorInfo {
  type: 'functionsBundling'
  location: {
    functionName: string
    runtime: RuntimeName
    bundler?: NodeBundlerName
  }
}

export class FunctionBundlingUserError extends Error {
  customErrorInfo: CustomErrorInfo

  constructor(
    message: string,
    customErrorInfo: {
      functionName: string
      runtime: RuntimeName
      bundler?: NodeBundlerName
    },
  ) {
    super(message)

    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'FunctionBundlingUserError'

    this.customErrorInfo = { type: 'functionsBundling', location: customErrorInfo }
  }
}
