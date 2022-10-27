/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  test: {
    setupFiles: ['./tests/helpers/vitest_setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 15_000,
    deps: {
      external: ['**/fixtures/**', '**/node_modules/**', '**/dist/**'],
    },
    coverage: {
      provider: 'c8',
      reporter: ['text', 'lcov'],
    },
  },
})
