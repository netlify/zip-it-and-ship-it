import type { NodeBundlerType } from '../runtimes/node/bundlers/types.js'
import type { RuntimeType } from '../runtimes/runtime'

interface CustomErrorLocation {
  functionName: string
  runtime: RuntimeType
  bundler?: NodeBundlerType
}

interface CustomErrorInfo {
  type: 'functionsBundling'
  location: CustomErrorLocation
}

type UserError = Error & { customErrorInfo: CustomErrorInfo }

export class FunctionBundlingUserError extends Error {
  constructor(message: string, customErrorInfo: CustomErrorLocation) {
    super(message)

    Object.setPrototypeOf(this, new.target.prototype)
    this.name = 'FunctionBundlingUserError'
    Error.captureStackTrace(this, FunctionBundlingUserError)

    FunctionBundlingUserError.addCustomErrorInfo(this, customErrorInfo)
  }

  static addCustomErrorInfo(error: Error, customErrorInfo: CustomErrorLocation): UserError {
    const info: CustomErrorInfo = {
      type: 'functionsBundling',
      location: customErrorInfo,
    }

    ;(error as UserError).customErrorInfo = info

    return error as UserError
  }
}
