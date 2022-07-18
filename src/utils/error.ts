import type { NodeBundlerName } from '../runtimes/node/bundlers/types.js'
import type { RuntimeName } from '../runtimes/runtime'

interface CustomErrorInfo {
  type: 'functionsBundling'
  location: {
    functionName: string
    runtime: RuntimeName
    bundler?: NodeBundlerName
  }
}

interface CustomErrorInput {
  functionName: string
  runtime: RuntimeName
  bundler?: NodeBundlerName
}

export class FunctionBundlingUserError extends Error {
  customErrorInfo: CustomErrorInfo

  constructor(messageOrError: string | Error, customErrorInfo: CustomErrorInput) {
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

  static fromError(error: Error, customErrorInfo: CustomErrorInput) {
    return new FunctionBundlingUserError(error.message, customErrorInfo)
  }
}
