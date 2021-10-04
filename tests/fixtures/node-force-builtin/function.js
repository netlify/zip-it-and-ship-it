const fs = require('node:fs')

module.exports = () => {
  const stats = fs.statSync(__dirname)

  return stats.isDirectory()
}
