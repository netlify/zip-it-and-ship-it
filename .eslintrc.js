const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  rules: {
    // TODO: enable those rules
    'max-lines': 0,
    'max-statements': 0,
  },
  overrides: [...overrides],
}
