import { promisify } from 'util'
import glob from 'glob'
import { Stats } from 'fs'

const pGlob = promisify(glob)

// When using a directory, we include all its descendants except `node_modules`
export const getTreeFiles = function (srcPath: string, stat: Stats) {
  if (!stat.isDirectory()) {
    return [srcPath]
  }

  return pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true,
  })
}
