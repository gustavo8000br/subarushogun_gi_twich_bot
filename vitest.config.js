import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    exclude: ['.aiox-core/**', 'node_modules/**'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
