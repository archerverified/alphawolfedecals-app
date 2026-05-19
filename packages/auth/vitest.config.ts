import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: [
        // Auth.js wrappers — covered by E2E.
        'src/server.ts',
        'src/auth-config.ts',
        // The Resend.send() path requires an external API; the dev-mode console
        // transport is exercised in tests/email.test.ts.
        'src/email.ts',
        // Re-export barrel.
        'src/index.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
