import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Mirror the tsconfig "@/*" path alias so colocated component tests can
    // import (and vi.mock) modules by their app-absolute specifier.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
