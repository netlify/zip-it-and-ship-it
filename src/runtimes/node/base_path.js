const commonPathPrefix = require('common-path-prefix')

const getBasePath = (dirnames) => {
  if (dirnames.length === 1) {
    return dirnames[0]
  }

  return commonPathPrefix(dirnames)
}

module.exports = { getBasePath }
