import { normalize, resolve } from 'path'
import { promisify } from 'util'

import glob from 'glob'
import minimatch from 'minimatch'

const pGlob = promisify(glob)

// Returns the subset of `paths` that don't match any of the glob expressions
// from `exclude`.
const filterExcludedPaths = (paths: string[], exclude: string[] = []) => {
  if (exclude.length === 0) {
    return paths
  }

  const excludedPaths = paths.filter((path) => !exclude.some((pattern) => minimatch(path, pattern)))

  return excludedPaths
}

const getPathsOfIncludedFiles = async (
  includedFiles: string[],
  basePath?: string,
): Promise<{ exclude: string[]; paths: string[] }> => {
  if (basePath === undefined) {
    return { exclude: [], paths: [] }
  }

  // Some of the globs in `includedFiles` might be exclusion patterns, which
  // means paths that should NOT be included in the bundle. We need to treat
  // these differently, so we iterate on the array and put those paths in a
  // `exclude` array and the rest of the paths in an `include` array.
  const { include, exclude } = includedFiles.reduce<{ include: string[]; exclude: string[] }>(
    (acc, path) => {
      if (path.startsWith('!')) {
        const excludePath = resolve(basePath, path.slice(1))

        return {
          include: acc.include,
          exclude: [...acc.exclude, excludePath],
        }
      }

      return {
        include: [...acc.include, path],
        exclude: acc.exclude,
      }
    },
    { include: [], exclude: [] },
  )
  const pathGroups = await Promise.all(
    include.map((expression) => pGlob(expression, { absolute: true, cwd: basePath, ignore: exclude, nodir: true })),
  )

  // `pathGroups` is an array containing the paths for each expression in the
  // `include` array. We flatten it into a single dimension.
  const paths = pathGroups.flat()
  const normalizedPaths = paths.map(normalize)

  return { exclude, paths: [...new Set(normalizedPaths)] }
}

export { filterExcludedPaths, getPathsOfIncludedFiles }
