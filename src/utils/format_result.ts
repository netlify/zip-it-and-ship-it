import { FunctionArchive } from '../function'
import { RuntimeName } from '../runtimes/runtime'

import { removeFalsy } from './remove_falsy'

type FunctionResult = FunctionArchive & { runtime: RuntimeName }

// Takes the result of zipping a function and formats it for output.
const formatZipResult = (archive: FunctionArchive) => {
  const result = removeFalsy({ ...archive, runtime: archive.runtime.name }) as FunctionResult

  return result
}

export { formatZipResult }
export type { FunctionResult }
