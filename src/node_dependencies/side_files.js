const { getPublishedFiles } = require('./published')

// Some modules generate source files on `postinstall` that are not located
// inside the module's directory itself.
const getSideFiles = function (modulePath, moduleName) {
  const sideFiles = SIDE_FILES[moduleName]
  if (sideFiles === undefined) {
    return []
  }

  return getPublishedFiles(`${modulePath}/${sideFiles}`)
}

const SIDE_FILES = {
  '@prisma/client': '../../.prisma',
}

module.exports = { getSideFiles }
