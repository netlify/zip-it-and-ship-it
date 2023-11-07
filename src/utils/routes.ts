import { RUNTIME } from '../runtimes/runtime.js'

import { FunctionBundlingUserError } from './error.js'
import { nonNullable } from './non_nullable.js'
import { ExtendedURLPattern } from './urlpattern.js'

export type Route = { pattern: string; methods: string[]; prefer_static?: boolean } & (
  | { literal: string }
  | { expression: string }
)

// Based on https://developer.mozilla.org/en-US/docs/Web/API/URL_Pattern_API.
const isExpression = (part: string) =>
  part.includes('*') || part.startsWith(':') || part.includes('{') || part.includes('[') || part.includes('(')

// Detects whether a path can be represented as a literal or whether it needs
// a regular expression.
const isPathLiteral = (path: string) => {
  const parts = path.split('/')

  return parts.every((part) => !isExpression(part))
}

interface GetRouteOption {
  functionName: string
  methods: string[]
  path: unknown
  preferStatic: boolean
}

/**
 * Takes an element from a `path` declaration and returns a Route element that
 * represents it.
 */
const getRoute = ({ functionName, methods, path, preferStatic }: GetRouteOption): Route | undefined => {
  if (typeof path !== 'string') {
    throw new FunctionBundlingUserError(`'path' property must be a string, found '${JSON.stringify(path)}'`, {
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
    return { pattern: path, literal: path, methods, prefer_static: preferStatic || undefined }
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

    return { pattern: path, expression: normalizedRegex, methods, prefer_static: preferStatic || undefined }
  } catch {
    throw new FunctionBundlingUserError(`'${path}' is not a valid path according to the URLPattern specification`, {
      functionName,
      runtime: RUNTIME.JAVASCRIPT,
    })
  }
}

interface GetRoutesOptions {
  functionName: string
  methods: string[]
  path: unknown
  preferStatic?: boolean
}

/**
 * Takes a `path` declaration, normalizes it into an array, and processes the
 * individual elements to obtain an array of `Route` expressions.
 */
export const getRoutes = ({
  functionName,
  methods,
  path: pathOrPaths,
  preferStatic = false,
}: GetRoutesOptions): Route[] => {
  if (!pathOrPaths) {
    return []
  }

  const paths = [...new Set(Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths])]
  const routes = paths
    .map((path) =>
      getRoute({
        functionName,
        methods,
        path,
        preferStatic,
      }),
    )
    .filter(nonNullable)

  return routes
}
