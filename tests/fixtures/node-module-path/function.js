const packageJson = require('require-package-name/package.json')

module.exports = typeof packageJson === 'object'
