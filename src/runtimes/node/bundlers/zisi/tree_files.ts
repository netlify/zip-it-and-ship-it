import { Stats } from 'fs'
import { promisify } from 'util'

import glob from 'glob'

const pGlob = promisify(glob)

// When using a directory, we include all its descendants except `node_modules`
const getTreeFiles = async function (srcPath: string, stat: Stats): Promise<string[]> {
  if (!stat.isDirectory()) {
    return [srcPath]
  }

  return await pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true,
  })
}

export { getTreeFiles }
