const { isNamedExport, isModuleExports, isVariableDeclarator } = require('./helpers')

const getExportFromCJS = (node) => {
  if (!isModuleExports(node)) {
    return []
  }

  return getExportsFromCallExpression(node.expression.right)
}

const getExportFromESM = (node) => {
  if (!isNamedExport(node)) {
    return []
  }

  const { declaration } = node

  if (declaration.type !== 'VariableDeclaration') {
    return []
  }

  const handlerDeclaration = declaration.declarations.find((childDeclaration) =>
    isVariableDeclarator(childDeclaration, 'handler'),
  )
  const exports = getExportsFromCallExpression(handlerDeclaration.init)

  return exports
}

const getExportsFromCallExpression = (node) => {
  const { arguments: args, callee, type } = node || {}

  if (type !== 'CallExpression') {
    return []
  }

  const exports = [{ local: callee.name, args }]

  return exports
}

const getHandlerExport = (nodes) => {
  let handlerExport

  nodes.some((node) => {
    const esmExports = getExportFromESM(node)

    if (esmExports.length !== 0) {
      handlerExport = esmExports

      return true
    }

    const cjsExports = getExportFromCJS(node)

    if (cjsExports.length !== 0) {
      handlerExport = cjsExports

      return true
    }

    return false
  })

  return handlerExport
}

module.exports = { getHandlerExport }
