const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  rules: {
    // TODO: enable those rules
    complexity: 0,
    'default-param-last': 0,
    'max-depth': 0,
    'max-lines': 0,
    'max-params': 0,
    'max-statements': 0,
    'no-magic-numbers': 0,
    'require-await': 0,
    'fp/no-mutating-methods': 0,
    'import/no-dynamic-require': 0,
    'node/global-require': 0,
    'node/prefer-global/buffer': 0,
    'promise/param-names': 0,
  },
  overrides: [...overrides],
}
