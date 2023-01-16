import { promisify } from 'util'

import globFunction from 'glob'
import { minimatch as minimatchFunction, MinimatchOptions } from 'minimatch'
import normalizePath from 'normalize-path'

const pGlob = promisify(globFunction)

/**
 * Both glob and minimatch only support unix style slashes in patterns
 * For this reason we wrap them and ensure all patters are always unixified
 * We use `normalize-path` here instead of `unixify` because we do not want to remove drive letters
 */

export const glob = function (pattern: string, options: globFunction.IOptions): Promise<string[]> {
  let normalizedIgnore

  if (options.ignore) {
    normalizedIgnore =
      typeof options.ignore === 'string'
        ? normalizePath(options.ignore)
        : options.ignore.map((expression) => normalizePath(expression))
  }

  return pGlob(normalizePath(pattern), { ...options, ignore: normalizedIgnore })
}

export const minimatch = function (target: string, pattern: string, options?: MinimatchOptions): boolean {
  return minimatchFunction(target, normalizePath(pattern), options)
}
