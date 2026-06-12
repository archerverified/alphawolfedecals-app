// Unit tests for the pure helpers in repos/generation.ts (Goal 7 D4/D7).
// No DB — these run in the default `unit` vitest project.

import { describe, expect, test } from 'vitest';
import {
  assertValidEstimatedCost,
  isInsufficientCreditsError,
  isRlsViolationError,
  monthStartUtc,
  spendReasonForKind,
  staleCutoff,
  uniqueViolationTarget,
} from '../src/repos/generation';

describe('monthStartUtc', () => {
  test('truncates to the first of the month at 00:00 UTC', () => {
    expect(monthStartUtc(new Date('2026-06-12T15:30:45.123Z')).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
  });

  test('is stable at the month boundary (last instant vs first instant)', () => {
    expect(monthStartUtc(new Date('2026-06-30T23:59:59.999Z')).toISOString()).toBe(
      '2026-06-01T00:00:00.000Z',
    );
    expect(monthStartUtc(new Date('2026-07-01T00:00:00.000Z')).toISOString()).toBe(
      '2026-07-01T00:00:00.000Z',
    );
  });

  test('uses UTC, not local time (Dec 31 23:00 UTC stays in December)', () => {
    expect(monthStartUtc(new Date('2026-12-31T23:00:00.000Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });
});

describe('staleCutoff', () => {
  test('subtracts the TTL in minutes', () => {
    const now = new Date('2026-06-12T12:00:00.000Z');
    expect(staleCutoff(now, 15).toISOString()).toBe('2026-06-12T11:45:00.000Z');
  });
});

describe('spendReasonForKind', () => {
  test('maps kinds to the PRD ledger reasons', () => {
    expect(spendReasonForKind('initial')).toBe('generation_run');
    expect(spendReasonForKind('iteration')).toBe('iteration_run');
    // 'final' is free (creditCost 0) so this rarely fires, but it must not
    // invent a third reason if a cost is ever configured for finals.
    expect(spendReasonForKind('final')).toBe('generation_run');
  });
});

describe('assertValidEstimatedCost', () => {
  test('accepts zero (free finals) and positive estimates', () => {
    expect(() => assertValidEstimatedCost(0)).not.toThrow();
    expect(() => assertValidEstimatedCost(0.5)).not.toThrow();
  });

  test('throws on a negative estimate (would widen the daily spend cap)', () => {
    expect(() => assertValidEstimatedCost(-0.01)).toThrow(/estimatedCostUsd must be >= 0/);
  });

  test('throws on non-finite estimates (NaN / Infinity are caller bugs)', () => {
    expect(() => assertValidEstimatedCost(Number.NaN)).toThrow(/estimatedCostUsd/);
    expect(() => assertValidEstimatedCost(Number.POSITIVE_INFINITY)).toThrow(/estimatedCostUsd/);
  });
});

describe('error classifiers', () => {
  test('isInsufficientCreditsError matches the definer raise wherever it lands in the message', () => {
    expect(
      isInsufficientCreditsError(
        new Error('Raw query failed. Code: `P0001`. Message: `insufficient_credits`'),
      ),
    ).toBe(true);
    expect(isInsufficientCreditsError(new Error('connection refused'))).toBe(false);
    expect(isInsufficientCreditsError('insufficient_credits')).toBe(true);
  });

  test('isRlsViolationError matches the Postgres WITH CHECK rejection', () => {
    expect(
      isRlsViolationError(
        new Error('new row violates row-level security policy for table "generation_runs"'),
      ),
    ).toBe(true);
    expect(isRlsViolationError(new Error('duplicate key value'))).toBe(false);
  });

  test('uniqueViolationTarget surfaces Prisma P2002 meta target', () => {
    const prismaError = Object.assign(new Error('Unique constraint failed on the fields'), {
      code: 'P2002',
      meta: { target: 'generation_runs_client_token_once' },
    });
    expect(uniqueViolationTarget(prismaError)).toContain('client_token');
  });

  test('uniqueViolationTarget surfaces raw Postgres duplicate-key messages', () => {
    const pgError = new Error(
      'duplicate key value violates unique constraint "credit_ledger_spend_once_per_run"',
    );
    expect(uniqueViolationTarget(pgError)).toContain('credit_ledger_spend_once_per_run');
  });

  test('uniqueViolationTarget returns null for unrelated errors', () => {
    expect(uniqueViolationTarget(new Error('timeout'))).toBeNull();
    expect(uniqueViolationTarget(null)).toBeNull();
  });

  test('uniqueViolationTarget joins array targets (Prisma model-level uniques)', () => {
    const prismaError = Object.assign(new Error('Unique constraint failed'), {
      code: 'P2002',
      meta: { target: ['run_id', 'concept_key', 'view'] },
    });
    expect(uniqueViolationTarget(prismaError)).toContain('concept_key');
  });
});
