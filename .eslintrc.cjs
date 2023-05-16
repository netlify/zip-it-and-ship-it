const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  parserOptions: {
    sourceType: 'module',
  },
  rules: {
    complexity: 'off',
    'import/extensions': ['error', 'ignorePackages'],
    'max-lines': 'off',
    'n/no-missing-import': 'off',
    'no-magic-numbers': 'off',
    'max-lines-per-function': 'off',
    // This rule enforces using Buffers with `JSON.parse()`. However, TypeScript
    // does not recognize yet that `JSON.parse()` accepts Buffers as argument.
    'unicorn/prefer-json-parse-buffer': 'off',
    'padding-line-between-statements': [
      'error',
      // Require newline before return
      { blankLine: 'always', prev: '*', next: 'return' },
      // Require newline after a batch of variable declarations
      { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
      { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    ],
  },
  overrides: [
    ...overrides,
    {
      files: '*.ts',
      rules: {
        // Pure ES modules with TypeScript require using `.js` instead of `.ts`
        // in imports
        'import/extensions': 'off',
        'import/no-namespace': 'off',
        // https://github.com/typescript-eslint/typescript-eslint/issues/2483
        'max-lines': 'off',
        'max-statements': 'off',
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',
      },
    },
    {
      files: 'tests/**/*.ts',
      rules: {
        'import/max-dependencies': 'off',
        'max-lines-per-function': 'off',
        'max-nested-callbacks': 'off',
        'max-statements': 'off',
        'padding-line-between-statements': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
  ignorePatterns: ['tests/fixtures/**/*'],
}
