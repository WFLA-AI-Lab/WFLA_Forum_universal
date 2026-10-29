import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: true,
    // SQLite/Miniflare integration suites can exceed Vitest's 5 s default
    // when the full test matrix runs concurrently on Windows CI.
    testTimeout: 15_000,
    hookTimeout: 30_000,
    fileParallelism: false
  }
});
