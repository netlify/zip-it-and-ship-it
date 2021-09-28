const isDotExpression = (node, expression) => {
  if (node.type !== 'MemberExpression') {
    return false
  }

  const object = expression.slice(0, -1)
  const [property] = expression.slice(-1)

  if (node.property.name !== property) {
    return false
  }

  if (object.length > 1) {
    return isDotExpression(node.object, object)
  }

  return object[0] === node.object.name && property === node.property.name
}

const isImport = (node, importPath) => {
  const { source, type } = node || {}

  return type === 'ImportDeclaration' && source.value === importPath
}

const isModuleExports = (node) => {
  const { expression, type } = node || {}

  return (
    type === 'ExpressionStatement' &&
    expression.type === 'AssignmentExpression' &&
    isDotExpression(expression.left, ['module', 'exports', 'handler'])
  )
}

const isNamedExport = (node) => {
  const { exportKind, type } = node || {}

  return type === 'ExportNamedDeclaration' && exportKind === 'value'
}

const isRequire = (node, requirePath) => {
  const { arguments: args, callee, type } = node || {}

  if (type !== 'CallExpression') {
    return false
  }

  const isRequiredModule = args.length === 1 && isRequirePath(args[0], requirePath)

  return isRequireCall(callee) && isRequiredModule
}

const isRequireCall = (node) => {
  const { name, type } = node || {}

  return type === 'Identifier' && name === 'require'
}

const isRequirePath = (node, path) => {
  const { type, value } = node || {}

  return type === 'StringLiteral' && value === path
}

const isVariableDeclarator = (node, name) => {
  const { id, type } = node || {}

  return type === 'VariableDeclarator' && id.name === name
}

module.exports = { isImport, isModuleExports, isNamedExport, isRequire, isVariableDeclarator }
