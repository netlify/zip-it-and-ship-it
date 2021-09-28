const babel = require('@babel/parser')

const { readFile } = require('../../../../utils/fs')

// Parses a JS/TS file and returns the resulting AST.
const parseFile = async ({ sourcePath }) => {
  const code = await readFile(sourcePath, 'utf8')
  const ast = babel.parse(code, {
    plugins: ['typescript'],
    sourceType: 'module',
  })

  return ast.program
}

// Attemps to parse a JS/TS file at the given path, returning its AST if
// successful, or `null` if not.
const safelyParseFile = async (sourcePath) => {
  if (!sourcePath) {
    return null
  }

  try {
    return await parseFile({ sourcePath })
  } catch (error) {
    return null
  }
}

module.exports = { safelyParseFile }
