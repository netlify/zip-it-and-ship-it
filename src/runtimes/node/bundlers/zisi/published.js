const { promisify } = require('util')

const glob = require('glob')

const pGlob = promisify(glob)

// We use all the files published by the Node.js except some that are not needed
const getPublishedFiles = async function (modulePath) {
  const ignore = getIgnoredFiles(modulePath)
  const publishedFiles = await pGlob(`${modulePath}/**`, {
    ignore,
    nodir: true,
    absolute: true,
    dot: true,
  })
  return publishedFiles
}

const getIgnoredFiles = function (modulePath) {
  return IGNORED_FILES.map((ignoreFile) => `${modulePath}/${ignoreFile}`)
}

// To make the zip archive smaller, we remove those.
const IGNORED_FILES = [
  'node_modules/**',
  '.npmignore',
  'package-lock.json',
  'yarn.lock',
  '*.log',
  '*.lock',
  '*~',
  '*.map',
  '*.ts',
  '*.patch',
]

module.exports = { getPublishedFiles }
