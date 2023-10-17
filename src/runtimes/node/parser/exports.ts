import type {
  Declaration,
  ExportDefaultDeclaration,
  ExportNamedDeclaration,
  ExportSpecifier,
  Expression,
  ObjectExpression,
  PatternLike,
  Statement,
} from '@babel/types'

import type { ISCExport } from '../in_source_config/index.js'
import { ModuleFormat, MODULE_FORMAT } from '../utils/module_format.js'

import type { BindingMethod } from './bindings.js'
import { isESMImportExport, isModuleExports } from './helpers.js'

type PrimitiveResult = string | number | boolean | Record<string, unknown> | undefined | null | PrimitiveResult[]

/**
 * Traverses a list of nodes and returns:
 *
 * 1. Named `config` object export (ESM or CJS)
 * 2. Whether there is a default export (ESM or CJS)
 * 3. Named `handler` function exports (ESM or CJS)
 * 4. The module format syntax used in the file: if any `import` or `export`
 *    declarations are found, this is ESM; if not, this is CJS
 */
export const traverseNodes = (nodes: Statement[], getAllBindings: BindingMethod) => {
  const handlerExports: ISCExport[] = []

  let configExport: Record<string, unknown> = {}
  let hasDefaultExport = false
  let inputModuleFormat: ModuleFormat = MODULE_FORMAT.COMMONJS

  nodes.forEach((node) => {
    if (isESMImportExport(node)) {
      inputModuleFormat = MODULE_FORMAT.ESM
    }

    const esmHandlerExports = getNamedESMExport(node, 'handler', getAllBindings)
    const esmConfigExports = getNamedESMExport(node, 'config', getAllBindings)

    if (esmConfigExports.length !== 0 && esmConfigExports[0].type === 'object-expression') {
      configExport = esmConfigExports[0].object
    }

    if (esmHandlerExports.length !== 0) {
      if (esmHandlerExports.some(({ type }) => type === 'default')) {
        hasDefaultExport = true

        return
      }
      handlerExports.push(...esmHandlerExports)

      return
    }

    const cjsHandlerExports = getCJSExports(node, 'handler')

    if (cjsHandlerExports.length !== 0) {
      handlerExports.push(...cjsHandlerExports)

      return
    }

    const cjsDefaultExports = getCJSExports(node, 'default')

    if (cjsDefaultExports.length !== 0) {
      hasDefaultExport = true

      return
    }

    if (isESMDefaultExport(node)) {
      hasDefaultExport = true
    }

    const esmConfig = parseConfigESMExport(node)

    if (esmConfig !== undefined) {
      configExport = esmConfig

      return
    }

    const cjsConfigExports = getCJSExports(node, 'config')

    if (cjsConfigExports.length !== 0 && cjsConfigExports[0].type === 'object-expression') {
      configExport = cjsConfigExports[0].object
    }
  })

  return { configExport, handlerExports, hasDefaultExport, inputModuleFormat }
}

// Finds the main handler export in a CJS AST.
const getCJSExports = (node: Statement, name: string) => {
  const handlerPaths = [
    ['module', 'exports', name],
    ['exports', name],
  ]

  return handlerPaths.flatMap((handlerPath) => {
    if (!isModuleExports(node, handlerPath)) {
      return []
    }

    return getExportsFromExpression(node.expression.right)
  })
}

/**
 * Finds a named ESM export with a given name. It's capable of finding exports
 * with a variable declaration (`export const foo = "bar"`), but also resolve
 * bindings and find things like `const baz = "1"; export { baz as foo }`.
 */
const getNamedESMExport = (node: Statement, name: string, getAllBindings: BindingMethod) => {
  if (node.type !== 'ExportNamedDeclaration' || node.exportKind !== 'value') {
    return []
  }

  const { declaration, specifiers } = node

  if (specifiers?.length > 0) {
    return getExportsFromBindings(specifiers, name, getAllBindings)
  }

  if (declaration?.type !== 'VariableDeclaration') {
    return []
  }

  const handlerDeclaration = declaration.declarations.find((childDeclaration) => {
    const { id, type } = childDeclaration

    return type === 'VariableDeclarator' && id.type === 'Identifier' && id.name === name
  })

  const exports = getExportsFromExpression(handlerDeclaration?.init)

  return exports
}

/**
 * Check if the node is an `ExportSpecifier` that has a identifier with a default export:
 * - `export { x as default }`
 */
const isDefaultExport = (node: ExportNamedDeclaration['specifiers'][number]): node is ExportSpecifier => {
  const { type, exported } = node

  return type === 'ExportSpecifier' && exported.type === 'Identifier' && exported.name === 'default'
}

/**
 * Check if the node is an `ExportSpecifier` that has a named export with
 * the given name, either as:
 * - `export { handler }`, or
 * - `export { x as "handler" }`
 */
const isNamedExport = (node: ExportNamedDeclaration['specifiers'][number], name: string): node is ExportSpecifier => {
  const { type, exported } = node

  return (
    type === 'ExportSpecifier' &&
    ((exported.type === 'Identifier' && exported.name === name) ||
      (exported.type === 'StringLiteral' && exported.value === name))
  )
}

// Returns whether a given node is a default export declaration.
const isESMDefaultExport = (node: Statement): node is ExportDefaultDeclaration =>
  node.type === 'ExportDefaultDeclaration'

/**
 * Finds a `config` named CJS export that maps to an object variable
 * declaration, like:
 *
 * `export const config = { prop1: "value 1" }`
 */
const parseConfigESMExport = (node: Statement) => {
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
 * - null
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

  if (exp.type === 'NullLiteral') {
    return null
  }
}

/**
 * Tries to resolve the export with a given name from a binding (variable).
 * For example, the following would resolve correctly to the handler function:
 *
 * `let handler; handler = () => {}; export { handler }`
 */
const getExportsFromBindings = (
  specifiers: ExportNamedDeclaration['specifiers'],
  name: string,
  getAllBindings: BindingMethod,
): ISCExport[] => {
  const specifier = specifiers.find((node) => isNamedExport(node, name))

  // If there's no named export with the given name, check if there's a default
  if (!specifier || specifier.type !== 'ExportSpecifier') {
    const defaultExport = specifiers.find((node) => isDefaultExport(node))

    if (defaultExport && defaultExport.type === 'ExportSpecifier') {
      const binding = getAllBindings().get(defaultExport.local.name)

      // eslint-disable-next-line max-depth
      if (binding?.type === 'ArrowFunctionExpression' || binding?.type === 'FunctionDeclaration') {
        return [{ type: 'default' }]
      }
    }

    return []
  }

  const binding = getAllBindings().get(specifier.local.name)

  const exports = getExportsFromExpression(binding)

  return exports
}

const getExportsFromExpression = (node: Expression | Declaration | undefined | null): ISCExport[] => {
  switch (node?.type) {
    case 'CallExpression': {
      const { arguments: args, callee } = node

      if (callee.type !== 'Identifier') {
        return []
      }

      return [{ args, local: callee.name, type: 'call-expression' }]
    }

    case 'ObjectExpression': {
      const object = parseObject(node)

      return [{ object, type: 'object-expression' }]
    }

    default: {
      if (node !== undefined) {
        return [{ type: 'other' }]
      }

      return []
    }
  }
}
