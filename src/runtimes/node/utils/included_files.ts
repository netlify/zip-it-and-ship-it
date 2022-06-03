import { normalize, resolve } from 'path'

import { minimatch, glob } from '../../../utils/matching'

// Returns the subset of `paths` that don't match any of the glob expressions
// from `exclude`.
export const filterExcludedPaths = (paths: string[], excludePattern: string[] = []) => {
  if (excludePattern.length === 0) {
    return paths
  }

  const excludedPaths = paths.filter((path) => !excludePattern.some((pattern) => minimatch(path, pattern)))

  return excludedPaths
}

export const getPathsOfIncludedFiles = async (
  includedFiles: string[],
  basePath?: string,
): Promise<{ excludePatterns: string[]; paths: string[] }> => {
  if (basePath === undefined) {
    return { excludePatterns: [], paths: [] }
  }

  // Some of the globs in `includedFiles` might be exclusion patterns, which
  // means paths that should NOT be included in the bundle. We need to treat
  // these differently, so we iterate on the array and put those paths in a
  // `exclude` array and the rest of the paths in an `include` array.
  const { include, excludePatterns } = includedFiles.reduce<{ include: string[]; excludePatterns: string[] }>(
    (acc, path) => {
      if (path.startsWith('!')) {
        // convert to unix paths, as minimatch does not support windows paths in patterns
        const excludePattern = resolve(basePath, path.slice(1))

        return {
          include: acc.include,
          excludePatterns: [...acc.excludePatterns, excludePattern],
        }
      }

      return {
        include: [...acc.include, path],
        excludePatterns: acc.excludePatterns,
      }
    },
    { include: [], excludePatterns: [] },
  )

  const pathGroups = await Promise.all(
    include.map((expression) =>
      glob(expression, { absolute: true, cwd: basePath, ignore: excludePatterns, nodir: true }),
    ),
  )

  // `pathGroups` is an array containing the paths for each expression in the
  // `include` array. We flatten it into a single dimension.
  const paths = pathGroups.flat()
  const normalizedPaths = paths.map(normalize)

  return { excludePatterns, paths: [...new Set(normalizedPaths)] }
}
