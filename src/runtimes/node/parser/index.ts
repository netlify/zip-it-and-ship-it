/* eslint-disable max-lines */
import { join, relative, resolve } from 'path'

import { parse } from '@babel/parser'
import type { BinaryExpression, CallExpression, Expression, PrivateName, TemplateLiteral, TSType } from '@babel/types'

import { readFile } from '../../../utils/fs'
import { nonNullable } from '../../../utils/non_nullable'

const GLOB_WILDCARD = '**'

// Transforms an array of glob nodes into a glob string including an absolute
// path.
//
// Example: ["./files/", "*", ".json"] => "/home/ntl/files/*.json"
const getAbsoluteGlob = ({
  basePath,
  globNodes,
  resolveDir,
}: {
  basePath: string
  globNodes: string[]
  resolveDir: string
}) => {
  if (!validateGlobNodes(globNodes)) {
    return null
  }

  const globStarIndex = globNodes.indexOf(GLOB_WILDCARD)
  const [staticPath, dynamicPath] =
    globStarIndex === -1
      ? [globNodes.join(''), '']
      : [globNodes.slice(0, globStarIndex).join(''), globNodes.slice(globStarIndex).join('')]
  const absoluteStaticPath = resolve(resolveDir, staticPath)
  const relativeStaticPath = relative(basePath, absoluteStaticPath)
  const absoluteGlob = join(relativeStaticPath, dynamicPath)

  return absoluteGlob
}

// Returns GLOB_WILDCARD for AST nodes that are accepted as part of a dynamic
// expression and convertable to a wildcard character. This determines whether
// we convert an expression or leave it alone. For example:
//
// - `./files/${someVariable}`: Convert `someVariable` to GLOB_WILDCARD
// - `./files/${[some, array]}`: Don't convert expression
//
// The following AST nodes are converted to a wildcard:
//
// - CallExpression: `someFunction()`
// - ConditionalExpression: `someCond ? someValue : otherValue`
// - Identifier: `someVariable`
// - MemberExpression: `someArray[index]` or `someObject.property`
const getWildcardFromASTNode = (node: Expression | PrivateName | TSType) => {
  switch (node.type) {
    case 'CallExpression':
    case 'ConditionalExpression':
    case 'Identifier':
    case 'MemberExpression':
      return GLOB_WILDCARD

    default:
      throw new Error('Expression member not supported')
  }
}

// Tries to parse an expression, returning an object with:
// - `includedPathsGlob`: A glob with the files to be included in the bundle
// - `type`: The expression type (e.g. "require", "import")
// eslint-disable-next-line complexity
const parseExpression = ({
  basePath,
  expression: rawExpression,
  resolveDir,
}: {
  basePath: string
  expression: string
  resolveDir: string
}) => {
  const { program } = parse(rawExpression, {
    sourceType: 'module',
  })
  const [statement] = program.body

  if (statement.type !== 'ExpressionStatement') {
    return
  }

  const { expression } = statement

  if (
    expression.type === 'CallExpression' &&
    expression.callee.type === 'Identifier' &&
    expression.callee.name === 'require'
  ) {
    try {
      const includedPathsGlob = parseRequire({ basePath, expression, resolveDir })

      return {
        includedPathsGlob,
        type: expression.callee.name,
      }
    } catch (_) {
      // no-op
    }
  }
}

// Parses a JS/TS file and returns the resulting AST.
const parseFile = async (path: string) => {
  const code = await readFile(path, 'utf8')
  const ast = parse(code, {
    plugins: ['typescript'],
    sourceType: 'module',
  })

  return ast.program
}

// Attemps to parse a JS/TS file at the given path, returning its AST if
// successful, or `null` if not.
const safelyParseFile = async (path: string) => {
  if (!path) {
    return null
  }

  try {
    return await parseFile(path)
  } catch (error) {
    return null
  }
}

// Parses a `require()` and returns a glob string with an absolute path.
const parseRequire = ({
  basePath,
  expression,
  resolveDir,
}: {
  basePath: string
  expression: CallExpression
  resolveDir: string
}) => {
  const { arguments: args = [] } = expression
  const [firstArg] = args

  if (firstArg === undefined) {
    return
  }

  if (firstArg.type === 'BinaryExpression') {
    try {
      const globNodes = parseBinaryExpression(firstArg)

      return getAbsoluteGlob({ basePath, globNodes, resolveDir })
    } catch (_) {
      // no-op
    }
  }

  if (firstArg.type === 'TemplateLiteral') {
    const globNodes = parseTemplateLiteral(firstArg)

    return getAbsoluteGlob({ basePath, globNodes, resolveDir })
  }
}

// Transforms a binary expression AST node into an array of glob nodes, where
// static parts will be left untouched and identifiers will be replaced by
// `GLOB_WILDCARD`.
//
// Example: './files/' + lang + '.json' => ["./files/", "**", ".json"]
const parseBinaryExpression = (expression: BinaryExpression): string[] => {
  const { left, operator, right } = expression

  if (operator !== '+') {
    throw new Error('Expression operator not supported')
  }

  const operands = [left, right].flatMap((operand) => {
    switch (operand.type) {
      case 'BinaryExpression':
        return parseBinaryExpression(operand)

      case 'StringLiteral':
        return operand.value

      default:
        return getWildcardFromASTNode(operand)
    }
  })

  return operands
}

// Transforms a template literal AST node into an array of glob nodes, where
// static parts will be left untouched and identifiers will be replaced by
// `GLOB_WILDCARD`.
//
// Example: `./files/${lang}.json` => ["./files/", "**", ".json"]
const parseTemplateLiteral = (expression: TemplateLiteral): string[] => {
  const { expressions, quasis } = expression
  const parts = [...expressions, ...quasis].sort((partA, partB) => (partA.start ?? 0) - (partB.start ?? 0))
  const globNodes = parts.map((part) => {
    switch (part.type) {
      case 'TemplateElement':
        return part.value.cooked === '' ? null : part.value.cooked

      default:
        return getWildcardFromASTNode(part)
    }
  })

  return globNodes.filter(nonNullable)
}

// For our purposes, we consider a glob to be valid if all the nodes are
// strings and the first node is static (i.e. not a wildcard character).
const validateGlobNodes = (globNodes: string[]) => {
  if (!globNodes) {
    return false
  }

  const hasStrings = globNodes.every((node) => typeof node === 'string')
  const hasStaticHead = globNodes[0] !== GLOB_WILDCARD

  return hasStrings && hasStaticHead
}

export { parseExpression, safelyParseFile }
/* eslint-enable max-lines */
