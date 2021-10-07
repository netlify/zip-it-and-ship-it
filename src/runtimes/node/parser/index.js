const { join, relative, resolve } = require('path')

const babel = require('@babel/parser')

const GLOB_WILDCARD = '**'

// Transforms an array of glob nodes into a glob string including an absolute
// path.
//
// Example: ["./files/", "*", ".json"] => "/home/ntl/files/*.json"
const getAbsoluteGlob = ({ basePath, globNodes, resolveDir }) => {
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
const getWildcardFromASTNode = (node) => {
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
const parseExpression = ({ basePath, expression: rawExpression, resolveDir }) => {
  const { program } = babel.parse(rawExpression, {
    sourceType: 'module',
  })
  const [topLevelExpression] = program.body
  const { expression } = topLevelExpression

  if (expression.type === 'CallExpression' && expression.callee.name === 'require') {
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

// Parses a `require()` and returns a glob string with an absolute path.
const parseRequire = ({ basePath, expression, resolveDir }) => {
  const { arguments: args = [] } = expression
  const argType = args.length === 0 ? null : args[0].type

  if (argType === 'BinaryExpression') {
    try {
      const globNodes = parseBinaryExpression(args[0])

      return getAbsoluteGlob({ basePath, globNodes, resolveDir })
    } catch (_) {
      // no-op
    }
  }

  if (argType === 'TemplateLiteral') {
    const globNodes = parseTemplateLiteral(args[0])

    return getAbsoluteGlob({ basePath, globNodes, resolveDir })
  }
}

// Transforms a binary expression AST node into an array of glob nodes, where
// static parts will be left untouched and identifiers will be replaced by
// `GLOB_WILDCARD`.
//
// Example: './files/' + lang + '.json' => ["./files/", "**", ".json"]
const parseBinaryExpression = (expression) => {
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
const parseTemplateLiteral = (expression) => {
  const { expressions, quasis } = expression
  const parts = [...expressions, ...quasis].sort((partA, partB) => partA.start - partB.start)
  const globNodes = parts.map((part) => {
    switch (part.type) {
      case 'TemplateElement':
        return part.value.cooked

      default:
        return getWildcardFromASTNode(part)
    }
  })

  return globNodes.filter(Boolean)
}

// For our purposes, we consider a glob to be valid if all the nodes are
// strings and the first node is static (i.e. not a wildcard character).
const validateGlobNodes = (globNodes) => {
  if (!globNodes) {
    return false
  }

  const hasStrings = globNodes.every((node) => typeof node === 'string')
  const hasStaticHead = globNodes[0] !== GLOB_WILDCARD

  return hasStrings && hasStaticHead
}

module.exports = { parseExpression }
