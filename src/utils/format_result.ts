import { FunctionArchive } from '../function'
import { RuntimeName } from '../runtimes/runtime'

import { removeUndefined } from './remove_undefined'

type FunctionResult = Omit<FunctionArchive, 'runtime'> & {
  runtime: RuntimeName
  schedule?: string
}

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (archive: FunctionArchive) => {
  const functionResult: FunctionResult = {
    ...archive,
    inSourceConfig: undefined,
    runtime: archive.runtime.name,
    schedule: archive.inSourceConfig?.schedule ?? archive?.config?.schedule,
  }

  return removeUndefined(functionResult)
}

export { formatZipResult }
export type { FunctionResult }
