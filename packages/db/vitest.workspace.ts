import { configDefaults, defineWorkspace } from 'vitest/config';

// Two Vitest projects so the default suite stays hermetic:
//
//   * unit        — pure logic, no external services. Run by `pnpm test` and
//                   by CI via turbo. The integration spec is excluded so a
//                   missing/unreachable dev database can never fail it.
//   * integration — hits the real Supabase dev database to prove RLS enforces.
//                   Never part of the default run; invoke explicitly via
//                   `pnpm test:integration` (which loads .env) or
//                   `vitest run --project integration`.
export default defineWorkspace([
  {
    test: {
      name: 'unit',
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      exclude: [...configDefaults.exclude, 'tests/**/*.integration.test.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      environment: 'node',
      include: ['tests/**/*.integration.test.ts'],
      // Real DB round-trips inside transactions — give hooks/tests room, and
      // run files serially so the shared fixtures don't race.
      hookTimeout: 30_000,
      testTimeout: 30_000,
      fileParallelism: false,
    },
  },
]);
