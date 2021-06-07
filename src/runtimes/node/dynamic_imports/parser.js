const { join, relative, resolve } = require('path')

const acorn = require('acorn')

const ECMA_VERSION = 2017

const parseExpression = ({ basePath, expression, resolveDir }) => {
  const { body } = acorn.parse(expression, { ecmaVersion: ECMA_VERSION })
  const { callee } = body[0].expression

  switch (callee.name) {
    case 'require':
      return parseRequire({ basePath, expression: body[0].expression, resolveDir })

    default:
    // no-op
  }
}

const parseRequire = ({ basePath, expression, resolveDir }) => {
  const { arguments: args, callee } = expression
  const argType = args[0].type

  if (argType === 'TemplateLiteral') {
    const includedPathsGlob = parseTemplateLiteral({ basePath, expression: args[0], resolveDir })

    return { includedPathsGlob, type: callee.name }
  }
}

// Transforms a template literal AST node into an absolute glob describing all
// files that the template literal may match.
//
// Example input: `./files/${lang}.json`
// Example output: "/home/ntl/files/*.json"
const parseTemplateLiteral = ({ basePath, expression, resolveDir }) => {
  const { expressions, quasis } = expression
  const parts = [...expressions, ...quasis].sort((partA, partB) => partA.start - partB.start)
  const globNodes = parts.map(({ type, value }) => {
    if (type === 'TemplateElement') {
      return value.cooked
    }

    if (type === 'Identifier') {
      return '*'
    }

    return null
  })
  const globStarIndex = globNodes.indexOf('*')
  const [staticPath, dynamicPath] =
    globStarIndex === -1
      ? [globNodes.join(''), '']
      : [globNodes.slice(0, globStarIndex).join(''), globNodes.slice(globStarIndex).join('')]
  const absoluteStaticPath = resolve(resolveDir, staticPath)
  const relativeStaticPath = relative(basePath, absoluteStaticPath)
  const absoluteGlob = join(relativeStaticPath, dynamicPath)

  return absoluteGlob
}

module.exports = { parseExpression }
