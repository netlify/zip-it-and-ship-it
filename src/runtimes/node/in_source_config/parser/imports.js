const { IN_SOURCE_CONFIG_MODULE } = require('../../../../utils/consts')

const { isImport, isRequire } = require('./helpers')

const getISCImports = (node) => {
  const esmImports = getISCImportsFromESM(node)

  if (esmImports.length !== 0) {
    return esmImports
  }

  const cjsImports = getISCImportsFromCJS(node)

  return cjsImports
}

const getISCImportsFromCJS = (node) => {
  const { declarations, type } = node || {}

  if (type !== 'VariableDeclaration') {
    return []
  }

  const requireDeclaration = declarations.find(
    (declaration) => declaration.type === 'VariableDeclarator' && isRequire(declaration.init, IN_SOURCE_CONFIG_MODULE),
  )

  if (requireDeclaration === undefined || requireDeclaration.id.type !== 'ObjectPattern') {
    return []
  }

  const imports = requireDeclaration.id.properties.map(({ key, value }) => ({ imported: key.name, local: value.name }))

  return imports
}

const getISCImportsFromESM = (node) => {
  if (!isImport(node, IN_SOURCE_CONFIG_MODULE)) {
    return []
  }

  const { specifiers } = node

  const imports = specifiers.map(({ imported, local }) => ({ imported: imported.name, local: local.name }))

  return imports
}

module.exports = { getISCImports }
