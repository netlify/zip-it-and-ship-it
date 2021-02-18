const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  overrides: [
    ...overrides,
    {
      files: 'tests/*.js',
      rules: {
        'max-lines-per-function': 'off',
        'max-statements': 'off',
      },
    },
  ],
}
