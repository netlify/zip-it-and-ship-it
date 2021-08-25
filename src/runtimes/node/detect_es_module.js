const { readFile } = require('fs')
const { promisify } = require('util')

const pReadFile = promisify(readFile)

const { init, parse } = require('es-module-lexer')

const detectEsModule = async ({ mainFile }) => {
  if (!mainFile) {
    return false
  }

  await init

  // Would love to just use await fs.promises.readFile, but it's not available in our version of Node.
  const mainFileContents = await pReadFile(mainFile, { encoding: 'utf8' })

  const [imports, exports] = parse(mainFileContents)

  return imports.length !== 0 && exports.length !== 0
}

module.exports = { detectEsModule }
