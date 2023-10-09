const packageJson = require('fake-module/package.json')

module.exports = typeof packageJson === 'object'
