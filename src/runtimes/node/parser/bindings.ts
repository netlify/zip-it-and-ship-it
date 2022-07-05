import type { Expression, Statement, VariableDeclaration } from '@babel/types'

type Bindings = Map<string, Expression>

const getBindingFromVariableDeclaration = function (node: VariableDeclaration, bindings: Bindings): void {
  node.declarations.forEach((declaration) => {
    if (declaration.id.type === 'Identifier' && declaration.init) {
      bindings.set(declaration.id.name, declaration.init)
    }
  })
}

// eslint-disable-next-line complexity
const getBindingsFromNode = function (node: Statement, bindings: Bindings): void {
  if (node.type === 'VariableDeclaration') {
    // A variable was created, so create it and store the potential value
    getBindingFromVariableDeclaration(node, bindings)
  } else if (
    node.type === 'ExpressionStatement' &&
    node.expression.type === 'AssignmentExpression' &&
    node.expression.left.type === 'Identifier'
  ) {
    // The variable was reassigned, so let's store the new value
    bindings.set(node.expression.left.name, node.expression.right)
  } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
    // A `export const|let ...` creates a binding that can later be referenced again
    getBindingFromVariableDeclaration(node.declaration, bindings)
  }
}

/**
 * Goes through all relevant nodes and creates a map from binding name to assigned value/expression
 */
const getAllBindings = function (nodes: Statement[]): Bindings {
  const bindings: Bindings = new Map()

  nodes.forEach((node) => {
    getBindingsFromNode(node, bindings)
  })

  return bindings
}

export type BindingMethod = () => Bindings

export const createBindingsMethod = function (nodes: Statement[]): BindingMethod {
  // memoize the result for these nodes
  let result: Bindings

  return () => {
    if (!result) {
      result = getAllBindings(nodes)
    }

    return result
  }
}
