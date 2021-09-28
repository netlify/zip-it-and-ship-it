const { safelyParseFile } = require('./parser/ast')
const { getHandlerExport } = require('./parser/exports')
const { getISCImports } = require('./parser/imports')
const { getISCImportFinderPlugin } = require('./plugin')
const { parse: parseCron } = require('./properties/cron')

// Properties in this object are in-source configuration properties supported
// by our build system. They map to a function that receives the arguments of
// the function call and return an object to be added to the bundling output.
const handlers = {
  cron: parseCron,
}

// Parses a JS/TS file and looks for in-source config declarations. It returns
// an array of all declarations found, with `property` indicating the name of
// the property and `data` its value.
const findISCDeclarations = async (sourcePath) => {
  const ast = await safelyParseFile(sourcePath)

  if (ast === null) {
    return []
  }

  const imports = ast.body.map(getISCImports).flat()
  const exports = getHandlerExport(ast.body)
  const iscExports = exports
    .map(({ args, local: exportName }) => {
      const matchingImport = imports.find(({ local: importName }) => importName === exportName)

      if (matchingImport === undefined) {
        return
      }

      const handler = handlers[matchingImport.imported]

      if (typeof handler !== 'function') {
        return
      }

      return handler({ args })
    })
    .filter(Boolean)

  return Object.assign({}, ...iscExports)
}

module.exports = { findISCDeclarations, getISCImportFinderPlugin }
