import { Stats } from 'fs'
import { promisify } from 'util'

import glob from 'glob'

const pGlob = promisify(glob)

// When using a directory, we include all its descendants except `node_modules`
const getTreeFiles = async function (srcPath: string, stat?: Stats): Promise<string[]> {
  // TODO: `stat` should always exist for the Node runtime, but we're using the
  // optional chaining operator here because it's not a mandatory property in
  // the `Runtime` interface. We should revisit this and see if we even need
  // to have `stat` in `Runtime` at all, or whether we can compute it when
  // needed (potentially using the FS cache).
  if (!stat?.isDirectory()) {
    return [srcPath]
  }

  return await pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true,
  })
}

export { getTreeFiles }
