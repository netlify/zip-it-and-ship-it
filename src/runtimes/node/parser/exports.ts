import type {
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  Statement,
} from '@babel/types'

import type { ISCExport } from '../in_source_config/index.js'

import type { BindingMethod } from './bindings.js'
import { isModuleExports } from './helpers.js'

// Finds two different types of exports in an AST:
// - Named `handler` exports, and
// - Default export
export const getExports = (nodes: Statement[], getAllBindings: BindingMethod) => {
  const handlerExports: ISCExport[] = []

  let defaultExport: ExportDefaultDeclaration | undefined

  nodes.forEach((node) => {
    const esmExports = getMainExportFromESM(node, getAllBindings)

    if (esmExports.length !== 0) {
      handlerExports.push(...esmExports)

      return
    }

    const cjsExports = getMainExportFromCJS(node)

    if (cjsExports.length !== 0) {
      handlerExports.push(...cjsExports)

      return
    }

    if (isDefaultExport(node)) {
      defaultExport = node
    }
  })

  return { defaultExport, handlerExports }
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

// Check if the Node is an ExportSpecifier that has a named export called `handler`
// either with Identifier `export { handler }`
// or with StringLiteral `export { x as "handler" }`
const isHandlerExport = (node: ExportNamedDeclaration['specifiers'][number]): node is ExportSpecifier => {
  const { type, exported } = node

  return (
    type === 'ExportSpecifier' &&
    ((exported.type === 'Identifier' && exported.name === 'handler') ||
      (exported.type === 'StringLiteral' && exported.value === 'handler'))
  )
}

const isDefaultExport = (node: Statement): node is ExportDefaultDeclaration => node.type === 'ExportDefaultDeclaration'

// Tries to resolve the export from a binding (variable)
// for example `let handler; handler = () => {}; export { handler }` would
// resolve correctly to the handler function
const getExportsFromBindings = (specifiers: ExportNamedDeclaration['specifiers'], getAllBindings: BindingMethod) => {
  const specifier = specifiers.find(isHandlerExport)

  if (!specifier) {
    return []
  }

  const binding = getAllBindings().get(specifier.local.name)
  const exports = getExportsFromExpression(binding)

  return exports
}

const getExportsFromExpression = (node: Expression | undefined | null) => {
  // We're only interested in expressions representing function calls, because
  // the ISC patterns we implement at the moment are all helper functions.
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
