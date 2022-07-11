import type { ExportNamedDeclaration, ExportSpecifier, Expression, Statement } from '@babel/types'

import type { ISCExport } from '../in_source_config/index.js'

import type { BindingMethod } from './bindings.js'
import { isModuleExports } from './helpers.js'

type ExportType = 'config' | 'handler'

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

export const getConfigExport = (nodes: Statement[], getAllBindings: BindingMethod) => {
  let configExport: ISCExport[] = []

  nodes.find((node) => {
    const esmExports = getMainExportFromESM(node, getAllBindings, 'config')

    if (esmExports.length !== 0) {
      configExport = esmExports

      return true
    }

    const cjsExports = getMainExportFromCJS(node, 'config')

    if (cjsExports.length !== 0) {
      configExport = cjsExports

      return true
    }

    return false
  })

  return configExport
}

// Finds the main handler export in a CJS AST.
const getMainExportFromCJS = (node: Statement, exportType: ExportType = 'handler') => {
  const handlerPaths = [
    ['module', 'exports', 'handler'],
    ['exports', 'handler'],
  ]

  const configPaths = [
    ['module', 'exports', 'config'],
    ['exports', 'config'],
  ]

  return exportType === 'handler'
    ? handlerPaths.flatMap((handlerPath) => {
        if (!isModuleExports(node, handlerPath)) {
          return []
        }

        return getExportsFromExpression(node.expression.right)
      })
    : configPaths.flatMap((handlerPath) => {
        if (!isModuleExports(node, handlerPath)) {
          return []
        }

        return getConfigFromExpression(node.expression.right)
      })
}

// Finds the main handler export in an ESM AST.
// eslint-disable-next-line complexity
const getMainExportFromESM = (node: Statement, getAllBindings: BindingMethod, exportType: ExportType = 'handler') => {
  if (node.type !== 'ExportNamedDeclaration' || node.exportKind !== 'value') {
    return []
  }

  const { declaration, specifiers } = node

  if (specifiers?.length > 0) {
    return getExportsFromBindings(specifiers, getAllBindings, exportType)
  }

  if (declaration?.type !== 'VariableDeclaration') {
    return []
  }

  const handlerDeclaration = declaration.declarations.find((childDeclaration) => {
    const { id, type } = childDeclaration

    return type === 'VariableDeclarator' && id.type === 'Identifier' && id.name === exportType
  })

  console.log(handlerDeclaration, 'handlerDeclaration')

  const exports =
    exportType === 'handler'
      ? getExportsFromExpression(handlerDeclaration?.init)
      : getConfigFromExpression(handlerDeclaration?.init)

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

// Check if the Node is an ExportSpecifier that has a named export called `config`
// either with Identifier `export { config }`
// or with StringLiteral `export { x as "config" }`
const isConfigExport = (node: ExportNamedDeclaration['specifiers'][number]): node is ExportSpecifier => {
  const { type, exported } = node

  return (
    type === 'ExportSpecifier' &&
    ((exported.type === 'Identifier' && exported.name === 'config') ||
      (exported.type === 'StringLiteral' && exported.value === 'config'))
  )
}

// Tries to resolve the export from a binding (variable)
// for example `let handler; handler = () => {}; export { handler }` would
// resolve correctly to the handler function
const getExportsFromBindings = (
  specifiers: ExportNamedDeclaration['specifiers'],
  getAllBindings: BindingMethod,
  exportType: ExportType = 'handler',
) => {
  const specifier = specifiers.find(exportType === 'handler' ? isHandlerExport : isConfigExport)

  if (!specifier) {
    return []
  }

  const binding = getAllBindings().get(specifier.local.name)
  const exports = exportType === 'handler' ? getExportsFromExpression(binding) : getConfigFromExpression(binding)

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

const getConfigFromExpression = (node: Expression | undefined | null) => {
  if (node?.type !== 'ObjectExpression') {
    return []
  }
  const { properties: args } = node
  const exports = [{ local: 'config', args }]

  return exports
}
