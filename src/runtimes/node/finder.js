const { lstat } = require('fs')
const { join, dirname, basename, extname } = require('path')
const { promisify } = require('util')

const locatePath = require('locate-path')

const pLstat = promisify(lstat)

const allowedExtensions = new Set(['.cjs', '.js', '.mjs', '.ts', '.zip'])

const findFunctionsInPaths = async function (paths) {
  const functions = await Promise.all(paths.map(getFunctionAtPath))

  // It's fine to mutate the array since its scope is local to this function.
  // eslint-disable-next-line fp/no-mutating-methods
  const sortedFunctions = functions.filter(Boolean).sort((fA, fB) => {
    // We first sort the functions array to put directories first. This is so
    // that `{name}/{name}.js` takes precedence over `{name}.js`.
    const directorySort = Number(fA.stat.isDirectory()) - Number(fB.stat.isDirectory())

    if (directorySort) {
      return directorySort
    }

    // We know that we're dealing with two files or two directories, so we sort
    // them by the full path, in descending order. This conveniently means that
    // when several files have the same name and different extensions, we place
    // `.zip` and `.ts` files before `.js` files, which means that JavaScript
    // files will take precedence once the array is flattened into a Map.
    if (fA.srcPath < fB.srcPath) {
      return 1
    }

    if (fA.srcPath > fB.srcPath) {
      return -1
    }

    return 0
  })

  return sortedFunctions
}

const getFunctionAtPath = async function (srcPath) {
  const filename = basename(srcPath)

  if (filename === 'node_modules') {
    return
  }

  const stat = await pLstat(srcPath)
  const mainFile = await getMainFile(srcPath, filename, stat)

  if (mainFile === undefined) {
    return
  }

  const srcDir = stat.isDirectory() ? srcPath : dirname(srcPath)
  const name = basename(srcPath, extname(srcPath))

  return { mainFile, name, srcDir, srcPath, stat }
}

// Each `srcPath` can also be a directory with an `index` file or a file using
// the same filename as its directory.
const getMainFile = function (srcPath, filename, stat) {
  if (stat.isDirectory()) {
    return locatePath(
      [
        join(srcPath, `${filename}.js`),
        join(srcPath, 'index.js'),
        join(srcPath, `${filename}.ts`),
        join(srcPath, 'index.ts'),
      ],
      { type: 'file' },
    )
  }

  const extension = extname(srcPath)

  if (allowedExtensions.has(extension)) {
    return srcPath
  }
}

module.exports = { findFunctionsInPaths, getFunctionAtPath }
