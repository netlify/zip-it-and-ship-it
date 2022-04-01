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
