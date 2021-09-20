const { readFile } = require('fs')
const { promisify } = require('util')

const pReadFile = promisify(readFile)

const { init, parse } = require('es-module-lexer')

const detectEsModule = async ({ mainFile }) => {
  if (!mainFile) {
    return false
  }

  try {
    const [mainFileContents] = await Promise.all([pReadFile(mainFile, 'utf8'), init])
    const [imports, exports] = parse(mainFileContents)

    return imports.length !== 0 || exports.length !== 0
  } catch {
    // If there are any problems with init or parsing, assume it's not an ES module
    return false
  }
}

module.exports = { detectEsModule }
