import { RUNTIME } from '../runtimes/runtime.js'

import { FunctionBundlingUserError } from './error.js'
import { ExtendedURLPattern } from './urlpattern.js'

export type Route = { pattern: string } & ({ literal: string } | { expression: string })

// Based on https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API.
const isExpression = (part: string) =>
  part.includes('*') || part.startsWith(':') || part.includes('{') || part.includes('[') || part.includes('(')

// Detects whether a path can be represented as a literal or whether it needs
// a regular expression.
const isPathLiteral = (path: string) => {
  const parts = path.split('/')

  return parts.every((part) => !isExpression(part))
}

export const getRoutesFromPath = (path: unknown, functionName: string): Route[] => {
  if (!path) {
    return []
  }

  if (typeof path !== 'string') {
    throw new FunctionBundlingUserError(`'path' property must be a string, found '${typeof path}'`, {
      functionName,
      runtime: RUNTIME.JAVASCRIPT,
    })
  }

  if (!path.startsWith('/')) {
    throw new FunctionBundlingUserError(`'path' property must start with a '/'`, {
      functionName,
      runtime: RUNTIME.JAVASCRIPT,
    })
  }

  if (isPathLiteral(path)) {
    return [{ pattern: path, literal: path }]
  }

  try {
    const pattern = new ExtendedURLPattern({ pathname: path })

    // Removing the `^` and `$` delimiters because we'll need to modify what's
    // between them.
    const regex = pattern.regexp.pathname.source.slice(1, -1)

    // Wrapping the expression source with `^` and `$`. Also, adding an optional
    // trailing slash, so that a declaration of `path: "/foo"` matches requests
    // for both `/foo` and `/foo/`.
    const normalizedRegex = `^${regex}\\/?$`

    return [{ pattern: path, expression: normalizedRegex }]
  } catch {
    throw new FunctionBundlingUserError(`'${path}' is not a valid path according to the URLPattern specification`, {
      functionName,
      runtime: RUNTIME.JAVASCRIPT,
    })
  }
}
