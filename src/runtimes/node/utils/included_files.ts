import { normalize, resolve } from 'path'

import fastGlob from 'fast-glob'

import { type FeatureFlags } from '../../../feature_flags.js'
import { minimatch } from '../../../utils/matching.js'

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
  featureFlags: FeatureFlags,
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

  const pathGroups = await fastGlob(include, {
    absolute: true,
    cwd: basePath,
    dot: true,
    ignore: excludePatterns,
    ...(featureFlags.zisi_fix_symlinks
      ? {
          onlyFiles: false,
          // get directories as well to get symlinked directories,
          // to filter the regular non symlinked directories out mark them with a slash at the end to filter them out.
          markDirectories: true,
          followSymbolicLinks: false,
        }
      : {
          followSymbolicLinks: true,
          throwErrorOnBrokenSymbolicLink: true,
        }),
  })

  const paths = featureFlags.zisi_fix_symlinks
    ? pathGroups.filter((path) => !path.endsWith('/')).map(normalize)
    : pathGroups.map(normalize)

  // now filter the non symlinked directories out that got marked with a trailing slash
  return { excludePatterns, paths }
}
