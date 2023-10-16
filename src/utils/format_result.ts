import { FunctionArchive } from '../function.js'
import { RuntimeName } from '../runtimes/runtime.js'

import { removeUndefined } from './remove_undefined.js'
import type { Route } from './routes.js'

export type FunctionResult = Omit<FunctionArchive, 'runtime'> & {
  routes?: Route[]
  runtime: RuntimeName
  schedule?: string
  runtimeAPIVersion?: number
}

// Takes the result of zipping a function and formats it for output.
export const formatZipResult = (archive: FunctionArchive) => {
  const functionResult: FunctionResult = {
    ...archive,
    staticAnalysisResult: undefined,
    routes: archive.staticAnalysisResult?.routes,
    runtime: archive.runtime.name,
    schedule: archive.staticAnalysisResult?.schedule ?? archive?.config?.schedule,
    runtimeAPIVersion: archive.staticAnalysisResult?.runtimeAPIVersion,
  }

  return removeUndefined(functionResult)
}
