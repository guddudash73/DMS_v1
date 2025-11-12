import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globals: true,
    passWithNoTests: false,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: process.env.CI ? { junit: 'test-reasult/vitest-junit.xml' } : undefined,
  },
});
