const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  rules: {
    // TODO: enable those rules
    'max-lines': 0,
    'max-statements': 0,
    'no-magic-numbers': 0,
    'import/no-dynamic-require': 0,
    'node/global-require': 0,
  },
  overrides: [...overrides],
}
