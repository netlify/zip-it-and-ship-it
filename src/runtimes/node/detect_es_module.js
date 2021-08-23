const fs = require('fs')

const { init, parse } = require('es-module-lexer')

const detectEsModule = async ({ srcFile }) => {
  // console.log('srcFile: ', srcFile)
  if (!srcFile) {
    return false
  }

  await init

  // Would love to just use await fs.promises.readFile, but it's not available in our version of Node.
  // eslint-disable-next-line node/no-sync
  const srcFileContents = fs.readFileSync(srcFile, { encoding: 'utf8' })

  const [imports, exports] = parse(srcFileContents)

  return imports.length !== 0 && exports.length !== 0
}

module.exports = { detectEsModule }
