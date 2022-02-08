const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  overrides: [
    ...overrides,
    {
      files: '*.ts',
      rules: {
        'import/no-namespace': 'off',
      },
    },
    {
      files: 'tests/**/*.js',
      rules: {
        'import/max-dependencies': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-magic-numbers': 'off',
      },
    },
    {
      files: '*.md/*.js',
      parserOptions: {
        sourceType: 'module',
      },
    },
  ],
  ignorePatterns: ['tests/fixtures/**/*'],
}
