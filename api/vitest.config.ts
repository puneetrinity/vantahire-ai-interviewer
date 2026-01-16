import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['tests/setup-env.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/db/**/*.db.test.ts'], // DB tests run separately with test:db
  },
});
