const { join } = require('path')

const cpFile = require('cp-file')

const { zipBinary } = require('../runtime')

const zipFunction = async function ({ srcPath, destFolder, stat, zipGo, filename, runtime }) {
  if (zipGo) {
    const destPath = join(destFolder, `${filename}.zip`)
    await zipBinary({ srcPath, destPath, filename, stat, runtime })
    return { path: destPath }
  }

  const destPath = join(destFolder, filename)
  await cpFile(srcPath, destPath)
  return { path: destPath }
}

module.exports = { zipFunction }
