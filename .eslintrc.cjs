const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  rules: {
    // This rule enforces using Buffers with `JSON.parse()`. However, TypeScript
    // does not recognize yet that `JSON.parse()` accepts Buffers as argument.
    'unicorn/prefer-json-parse-buffer': 'off',
  },
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
