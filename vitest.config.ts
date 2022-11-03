/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/helpers/vitest_setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    deps: {
      interopDefault: false,
      external: ['**/fixtures/**', '**/node_modules/**', '**/dist/**'],
    },
    coverage: {
      provider: 'c8',
      reporter: ['text', 'lcov'],
    },
  },
})
