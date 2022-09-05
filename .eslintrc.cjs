const { overrides } = require('@netlify/eslint-config-node')

module.exports = {
  extends: '@netlify/eslint-config-node',
  rules: {
    'import/extensions': ['error', 'ignorePackages'],
    'n/no-missing-import': 'off',
    // This is disabled because TypeScript transpiles some features currently
    // unsupported by Node 12, i.e. optional chaining
    // TODO: re-enable after dropping support for Node 12
    'n/no-unsupported-features/es-syntax': 'off',
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
        'no-shadow': 'off',
        '@typescript-eslint/no-shadow': 'error',
      },
    },
    {
      files: 'tests/**/*.js',
      rules: {
        'import/max-dependencies': 'off',
        'max-lines-per-function': 'off',
        'max-statements': 'off',
        'no-magic-numbers': 'off',
        'padding-line-between-statements': 'off',
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
