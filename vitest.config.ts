import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  test: {
    // E2E tests need longer timeouts (skill involves LLM calls + validation)
    testTimeout: 300000, // 5 minutes per test
    hookTimeout: 120000, // 2 minutes for setup/teardown

    // Run tests sequentially (they share filesystem state)
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },

    // Test file patterns
    include: ['tests/e2e/**/*.test.ts'],

    // Setup files
    setupFiles: ['./tests/e2e/setup.ts'],

    // Environment
    globals: true,

    // Reporters
    reporters: ['verbose'],

    // Root directory
    root: path.resolve(__dirname),
  },
});
