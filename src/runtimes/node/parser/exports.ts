import type {
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  ObjectExpression,
  PatternLike,
  Statement,
} from '@babel/types'

import type { ISCExport } from '../in_source_config/index.js'

import type { BindingMethod } from './bindings.js'
import { isModuleExports } from './helpers.js'

type PrimitiveResult = string | number | boolean | Record<string, unknown> | undefined | PrimitiveResult[]

// Finds and returns the following types of exports in an AST:
// 1. Named `handler` function exports
// 2. Default function export
// 3. Named `config` object export
export const getExports = (nodes: Statement[], getAllBindings: BindingMethod) => {
  const handlerExports: ISCExport[] = []

  let configExport: Record<string, unknown> = {}
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

      return
    }

    const config = parseConfigExport(node)

    if (config !== undefined) {
      configExport = config
    }
  })

  return { configExport, defaultExport, handlerExports }
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

// Returns whether a given node is a default export declaration.
const isDefaultExport = (node: Statement): node is ExportDefaultDeclaration => node.type === 'ExportDefaultDeclaration'

// Finds a `config` named export that maps to an object variable declaration,
// like:
//
// export const config = { prop1: "value 1" }
const parseConfigExport = (node: Statement) => {
  if (
    node.type === 'ExportNamedDeclaration' &&
    node.declaration?.type === 'VariableDeclaration' &&
    node.declaration.declarations[0].type === 'VariableDeclarator' &&
    node.declaration.declarations[0].id.type === 'Identifier' &&
    node.declaration.declarations[0].id.name === 'config' &&
    node.declaration.declarations[0].init?.type === 'ObjectExpression'
  ) {
    return parseObject(node.declaration.declarations[0].init)
  }
}

/**
 * Takes an object expression node and returns the object resulting from the
 * subtree. Only values supported by the `parsePrimitive` method are returned,
 * and any others will be ignored and excluded from the resulting object.
 */
const parseObject = (node: ObjectExpression) =>
  node.properties.reduce((acc, property): Record<string, unknown> => {
    if (property.type !== 'ObjectProperty' || property.key.type !== 'Identifier') {
      return acc
    }

    return {
      ...acc,
      [property.key.name]: parsePrimitive(property.value),
    }
  }, {} as Record<string, unknown>)

/**
 * Takes an expression and, if it matches a JavaScript primitive type, returns
 * the corresponding value. If not, `undefined` is returned.
 * Currently, the following primitive types are supported:
 *
 * - boolean
 * - number
 * - object
 * - string
 * - array
 */
const parsePrimitive = (exp: Expression | PatternLike): PrimitiveResult => {
  if (exp.type === 'BooleanLiteral' || exp.type === 'NumericLiteral' || exp.type === 'StringLiteral') {
    return exp.value
  }

  if (exp.type === 'ArrayExpression') {
    return exp.elements.map((element) => {
      if (element === null || element.type === 'SpreadElement') {
        return
      }

      return parsePrimitive(element)
    })
  }

  if (exp.type === 'ObjectExpression') {
    return parseObject(exp)
  }
}

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

const getExportsFromExpression = (node: Expression | undefined | null): ISCExport[] => {
  switch (node?.type) {
    case 'CallExpression': {
      const { arguments: args, callee } = node

      if (callee.type !== 'Identifier') {
        return []
      }

      return [{ args, local: callee.name, type: 'call-expression' }]
    }

    default: {
      if (node !== undefined) {
        return [{ type: 'other' }]
      }

      return []
    }
  }
}
