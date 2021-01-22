const { promisify } = require('util')

const glob = require('glob')

const pGlob = promisify(glob)

// When using a directory, we include all its descendants except `node_modules`
const getTreeFiles = function (srcPath, stat) {
  if (!stat.isDirectory()) {
    return [srcPath]
  }

  return pGlob(`${srcPath}/**`, {
    ignore: `${srcPath}/**/node_modules/**`,
    nodir: true,
    absolute: true,
  })
}

module.exports = { getTreeFiles }
