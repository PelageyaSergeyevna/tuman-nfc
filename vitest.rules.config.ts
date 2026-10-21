import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'rules',
    environment: 'node',
    globals: true,
    include: ['tools/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: 'forks',
    fileParallelism: false,
  },
});
