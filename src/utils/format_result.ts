import { FunctionArchive } from '../function.js'
import { RuntimeName } from '../runtimes/runtime.js'

import { removeUndefined } from './remove_undefined.js'

export type FunctionResult = Omit<FunctionArchive, 'runtime'> & {
  runtime: RuntimeName
  schedule?: string
  runtimeAPIVersion?: number
}

// Takes the result of zipping a function and formats it for output.
export const formatZipResult = (archive: FunctionArchive) => {
  const functionResult: FunctionResult = {
    ...archive,
    inSourceConfig: undefined,
    runtime: archive.runtime.name,
    schedule: archive.inSourceConfig?.schedule ?? archive?.config?.schedule,
    runtimeAPIVersion: archive.inSourceConfig?.runtimeAPIVersion,
  }

  return removeUndefined(functionResult)
}
