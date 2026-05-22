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
        // Re-export barrels — no logic.
        'src/index.ts',
        'src/serialization/index.ts',
        'src/history/index.ts',
        'src/geometry/index.ts',
        // Type-only modules (erased at runtime, nothing to cover).
        'src/schema/types.ts',
        'src/history/command.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
});
