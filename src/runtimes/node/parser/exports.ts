import type {
  ExportDefaultSpecifier,
  ExportNamespaceSpecifier,
  ExportSpecifier,
  Expression,
  Statement,
} from '@babel/types'

import type { ISCExport } from '../in_source_config/index.js'

import type { BindingMethod } from './bindings.js'
import { isModuleExports } from './helpers.js'

// Finds the main handler export in an AST.
export const getMainExport = (nodes: Statement[], getAllBindings: BindingMethod) => {
  let handlerExport: ISCExport[] = []

  nodes.find((node) => {
    const esmExports = getMainExportFromESM(node, getAllBindings)

    if (esmExports.length !== 0) {
      handlerExport = esmExports

      return true
    }

    const cjsExports = getMainExportFromCJS(node)

    if (cjsExports.length !== 0) {
      handlerExport = cjsExports

      return true
    }

    return false
  })

  return handlerExport
}

// Finds the main handler export in a CJS AST.
const getMainExportFromCJS = (node: Statement) => {
  const handlerPaths = [
    ['module', 'exports', 'handler'],
    ['exports', 'handler'],
  ]

  return handlerPaths.flatMap((handlerPath) => {
    if (!isModuleExports(node, handlerPath)) {
      return []
    }

    return getExportsFromExpression(node.expression.right)
  })
}

// Finds the main handler export in an ESM AST.
const getMainExportFromESM = (node: Statement, getAllBindings: BindingMethod) => {
  if (node.type !== 'ExportNamedDeclaration' || node.exportKind !== 'value') {
    return []
  }

  const { declaration, specifiers } = node

  if (specifiers?.length > 0) {
    return getExportsFromBindings(specifiers, getAllBindings)
  }

  if (declaration?.type !== 'VariableDeclaration') {
    return []
  }

  const handlerDeclaration = declaration.declarations.find((childDeclaration) => {
    const { id, type } = childDeclaration

    return type === 'VariableDeclarator' && id.type === 'Identifier' && id.name === 'handler'
  })

  const exports = getExportsFromExpression(handlerDeclaration?.init)

  return exports
}

const getExportsFromBindings = (
  specifiers: (ExportSpecifier | ExportDefaultSpecifier | ExportNamespaceSpecifier)[],
  getAllBindings: BindingMethod,
) => {
  const specifier = specifiers.find(
    ({ type, exported }) =>
      type === 'ExportSpecifier' &&
      ((exported.type === 'Identifier' && exported.name === 'handler') ||
        (exported.type === 'StringLiteral' && exported.value === 'handler')),
  ) as ExportSpecifier | undefined

  if (!specifier) {
    return []
  }

  const binding = getAllBindings().get(specifier.local.name)
  const exports = getExportsFromExpression(binding)

  return exports
}

const getExportsFromExpression = (node: Expression | undefined | null) => {
  if (node?.type !== 'CallExpression') {
    return []
  }
  const { arguments: args, callee } = node

  if (callee.type !== 'Identifier') {
    return []
  }

  const exports = [{ local: callee.name, args }]

  return exports
}
