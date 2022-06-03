import { promisify } from 'util'

import globFunction from 'glob'
import minimatchFunction from 'minimatch'
import unixify from 'unixify'

const pGlob = promisify(globFunction)

/**
 * Both glob and minimatch only support unix style slashes in patterns
 * For this reason we wrap them and ensure all patters are always unixified
 */

export const glob = function (pattern: string, options: globFunction.IOptions): Promise<string[]> {
  let normalizedIgnore
  if (options.ignore) {
    normalizedIgnore =
      typeof options.ignore === 'string'
        ? unixify(options.ignore)
        : options.ignore.map((expression) => unixify(expression))
  }
  return pGlob(unixify(pattern), { ...options, ignore: normalizedIgnore })
}

export const minimatch = function (target: string, pattern: string, options?: minimatchFunction.IOptions): boolean {
  return minimatchFunction(target, unixify(pattern), options)
}
