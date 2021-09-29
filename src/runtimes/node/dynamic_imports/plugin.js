const { basename, join, relative } = require('path')

const findUp = require('find-up')
const readPackageJson = require('read-package-json-fast')
const unixify = require('unixify')

const { parseExpression } = require('./parser')

// This plugin intercepts module imports using dynamic expressions and does a
// couple of things with them. First of all, it figures out whether the call
// is being made from within a Node module, and if so it adds the name of the
// module to `moduleNames`, so that we can warn the user of potential runtime
// issues. Secondly, it parses the dynamic expressions and tries to include in
// the bundle all the files that are possibly needed to make the import work at
// runtime. This is not always possible, but we do our best.
const getDynamicImportsPlugin = ({ basePath, includedPaths, moduleNames, processImports, srcDir }) => ({
  name: 'dynamic-imports',
  setup(build) {
    const cache = new Map()

    // eslint-disable-next-line complexity
    build.onDynamicImport({}, async (args) => {
      const { expression, resolveDir } = args

      // Don't attempt to parse the expression if the base path isn't defined,
      // since we won't be able to generate the globs for the included paths.
      // Also don't parse the expression if we're not interested in processing
      // the dynamic import expressions.
      if (basePath && processImports) {
        const { includedPathsGlob, type: expressionType } = parseExpression({ basePath, expression, resolveDir }) || {}

        if (includedPathsGlob) {
          // The parser has found a glob of paths that should be included in the
          // bundle to make this import work, so we add it to `includedPaths`.
          includedPaths.add(includedPathsGlob)

          // Create the shim that will handle the import at runtime.
          const contents = getShimContents({ expressionType, resolveDir, srcDir })

          // This is the only branch where we actually solve a dynamic import.
          // eslint-disable-next-line max-depth
          if (contents) {
            return {
              contents,
            }
          }
        }
      }

      // If we're here, it means we weren't able to solve the dynamic import.
      // We add it to the list of modules with dynamic imports, which allows
      // consumers like Netlify Build or CLI to advise users on how to proceed.
      await registerModuleWithDynamicImports({ cache, moduleNames, resolveDir, srcDir })
    })
  },
})

const getPackageName = async ({ resolveDir, srcDir }) => {
  const packageJsonPath = await findUp(
    async (directory) => {
      // We stop traversing if we're about to leave the boundaries of the
      // function directory or any node_modules directory.
      if (directory === srcDir || basename(directory) === 'node_modules') {
        return findUp.stop
      }

      const path = join(directory, 'package.json')
      const hasPackageJson = await findUp.exists(path)

      return hasPackageJson ? path : false
    },
    { cwd: resolveDir },
  )

  if (packageJsonPath !== undefined) {
    const { name } = await readPackageJson(packageJsonPath)

    return name
  }
}

const getPackageNameCached = ({ cache, resolveDir, srcDir }) => {
  if (!cache.has(resolveDir)) {
    cache.set(resolveDir, getPackageName({ resolveDir, srcDir }))
  }

  return cache.get(resolveDir)
}

const getShimContents = ({ expressionType, resolveDir, srcDir }) => {
  // The shim needs to modify the path of the import, since originally it was
  // relative to wherever the importer sat in the file tree (i.e. anywhere in
  // the user space or inside `node_modules`), but at runtime paths must be
  // relative to the main bundle file, since esbuild will flatten everything
  // into a single file.
  const relativeResolveDir = relative(srcDir, resolveDir)
  const requireArg = relativeResolveDir ? `\`./${unixify(relativeResolveDir)}/$\{args}\`` : 'args'

  if (expressionType === 'require') {
    return `module.exports = args => require(${requireArg})`
  }
}

const registerModuleWithDynamicImports = async ({ cache, moduleNames, resolveDir, srcDir }) => {
  try {
    const packageName = await getPackageNameCached({ cache, resolveDir, srcDir })

    if (packageName !== undefined) {
      moduleNames.add(packageName)
    }
  } catch (_) {
    // no-op
  }
}

module.exports = { getDynamicImportsPlugin }
