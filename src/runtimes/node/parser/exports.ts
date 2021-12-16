import { CallExpression, Statement } from '@babel/types'

import type { ISCExport } from '../in_source_config'

import { isModuleExports } from './helpers'

// Finds the main handler export in an AST.
const getMainExport = (nodes: Statement[]) => {
  let handlerExport: ISCExport[] = []

  nodes.find((node) => {
    const esmExports = getMainExportFromESM(node)

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
    if (!isModuleExports(node, handlerPath) || node.expression.right.type !== 'CallExpression') {
      return []
    }

    return getExportsFromCallExpression(node.expression.right)
  })
}

// Finds the main handler export in an ESM AST.
// eslint-disable-next-line complexity
const getMainExportFromESM = (node: Statement) => {
  if (node.type !== 'ExportNamedDeclaration' || node.exportKind !== 'value') {
    return []
  }

  const { declaration } = node

  if (!declaration || declaration.type !== 'VariableDeclaration') {
    return []
  }

  const handlerDeclaration = declaration.declarations.find((childDeclaration) => {
    const { id, type } = childDeclaration

    return type === 'VariableDeclarator' && id.type === 'Identifier' && id.name === 'handler'
  })

  if (handlerDeclaration?.init?.type !== 'CallExpression') {
    return []
  }

  const exports = getExportsFromCallExpression(handlerDeclaration.init)

  return exports
}

const getExportsFromCallExpression = (node: CallExpression) => {
  const { arguments: args, callee } = node

  if (callee.type !== 'Identifier') {
    return []
  }

  const exports = [{ local: callee.name, args }]

  return exports
}

export { getMainExport }
