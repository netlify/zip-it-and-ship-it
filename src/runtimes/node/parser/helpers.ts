import {
  AssignmentExpression,
  Expression,
  ExpressionStatement,
  ImportDeclaration,
  Statement,
  StringLiteral,
  V8IntrinsicIdentifier,
} from '@babel/types'

// eslint-disable-next-line complexity
const isDotExpression = (node: Expression, expression: string[]): boolean => {
  if (node.type !== 'MemberExpression') {
    return false
  }

  const object = expression.slice(0, -1)
  const [property] = expression.slice(-1)

  if (node.property.type !== 'Identifier' || node.property.name !== property) {
    return false
  }

  if (object.length > 1) {
    return isDotExpression(node.object, object)
  }

  return node.object.type === 'Identifier' && object[0] === node.object.name && property === node.property.name
}

export const isImport = (node: Statement, importPath: string): node is ImportDeclaration =>
  node.type === 'ImportDeclaration' && node.source.value === importPath

export const isModuleExports = (
  node: Statement,
  dotExpression = ['module', 'exports'],
): node is ExpressionStatement & { expression: AssignmentExpression } =>
  node.type === 'ExpressionStatement' &&
  node.expression.type === 'AssignmentExpression' &&
  node.expression.left.type === 'MemberExpression' &&
  isDotExpression(node.expression.left, dotExpression)

export const isRequire = (node: Expression | undefined | null, requirePath: string) => {
  if (!node || node.type !== 'CallExpression') {
    return false
  }

  const { arguments: args, callee } = node
  const isRequiredModule = args[0]?.type === 'StringLiteral' && isRequirePath(args[0], requirePath)

  return isRequireCall(callee) && isRequiredModule
}

const isRequireCall = (node: Expression | V8IntrinsicIdentifier) =>
  node.type === 'Identifier' && node.name === 'require'

const isRequirePath = (node: StringLiteral, path: string) => node.type === 'StringLiteral' && node.value === path
