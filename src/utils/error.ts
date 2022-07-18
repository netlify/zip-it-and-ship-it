import type { NodeBundlerName } from '../runtimes/node/bundlers/types.js'
import type { RuntimeName } from '../runtimes/runtime'

interface CustomErrorLocation {
  functionName: string
  runtime: RuntimeName
  bundler?: NodeBundlerName
}

interface CustomErrorInfo {
  type: 'functionsBundling'
  location: CustomErrorLocation
}

export class FunctionBundlingUserError extends Error {
  customErrorInfo: CustomErrorInfo

  constructor(messageOrError: string | Error, customErrorInfo: CustomErrorLocation) {
    const isError = messageOrError instanceof Error

    super(isError ? messageOrError.message : messageOrError)

    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'FunctionBundlingUserError'
    if (isError) {
      this.stack = messageOrError.stack
    } else {
      Error.captureStackTrace(this, FunctionBundlingUserError)
    }

    this.customErrorInfo = { type: 'functionsBundling', location: customErrorInfo }
  }
}
