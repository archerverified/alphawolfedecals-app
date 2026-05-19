// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.venv/**',
      '**/__pycache__/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  // ADR-0002 follow-up: only @alphawolf/db may import @prisma/client. Bare
  // imports elsewhere bypass the RLS session-variable middleware and become
  // a security bug.
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    ignores: ['packages/db/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'Import from @alphawolf/db instead. Bare @prisma/client bypasses the RLS session-variable middleware (ADR-0002).',
            },
          ],
          patterns: [
            {
              group: ['@prisma/client/*'],
              message:
                'Import from @alphawolf/db instead. Bare @prisma/client bypasses the RLS session-variable middleware (ADR-0002).',
            },
          ],
        },
      ],
    },
  },
);
