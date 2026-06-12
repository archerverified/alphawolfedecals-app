import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Use the automatic JSX runtime (matches Next's transform) so component tests
  // can render JSX without a manual `import React`. esbuild defaults to classic.
  esbuild: { jsx: 'automatic' },
  resolve: {
    // Mirror the tsconfig "@/*" path alias so colocated component tests can
    // import (and vi.mock) modules by their app-absolute specifier.
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
      // `server-only` throws outside a React Server environment; tests import
      // server modules (lib/ai/*) directly, so stub the marker out.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'components/**/*.test.{ts,tsx}'],
    passWithNoTests: true,
  },
});
