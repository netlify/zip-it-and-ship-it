const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  overrides: [
    ...overrides,
    {
      files: 'tests/*.js',
      rules: {
        'import/max-dependencies': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
      },
    },
  ],
  ignorePatterns: ['tests/fixtures/**/*'],
}
