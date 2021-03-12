const { lstat } = require('fs')
const { join, dirname, basename, extname } = require('path')
const { promisify } = require('util')

const locatePath = require('locate-path')

const pLstat = promisify(lstat)

// List of extensions that this runtime will look for, in order of precedence.
const allowedExtensions = ['.js', '.zip', '.cjs', '.mjs', '.ts']

// Sorting function, compatible with the callback of Array.sort, which sorts
// entries by extension according to their position in `allowedExtensions`.
// It places extensions with a higher precedence last in the array, so that
// they "win" when the array is flattened into a Map.
const sortByExtension = (fA, fB) => {
  const indexA = allowedExtensions.indexOf(fA.extension)
  const indexB = allowedExtensions.indexOf(fB.extension)

  return indexB - indexA
}

const findFunctionsInPaths = async function (paths) {
  const functions = await Promise.all(paths.map(getFunctionAtPath))

  // It's fine to mutate the array since its scope is local to this function.
  // eslint-disable-next-line fp/no-mutating-methods
  const sortedFunctions = functions.filter(Boolean).sort((fA, fB) => {
    // We first sort the functions array to put directories first. This is so
    // that `{name}/{name}.js` takes precedence over `{name}.js`.
    const directorySort = Number(fA.stat.isDirectory()) - Number(fB.stat.isDirectory())

    if (directorySort !== 0) {
      return directorySort
    }

    // If the functions have the same name, we sort them according to the order
    // defined in `allowedExtensions`.
    if (fA.name === fB.name) {
      return sortByExtension(fA, fB)
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

  const extension = extname(srcPath)
  const srcDir = stat.isDirectory() ? srcPath : dirname(srcPath)
  const name = basename(srcPath, extname(srcPath))

  return { extension, mainFile, name, srcDir, srcPath, stat }
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

  if (allowedExtensions.includes(extension)) {
    return srcPath
  }
}

module.exports = { findFunctionsInPaths, getFunctionAtPath }
