const fs = require('node:stream/web')

module.exports = () => {
  const stats = fs.statSync(__dirname)

  return stats.isDirectory()
}
