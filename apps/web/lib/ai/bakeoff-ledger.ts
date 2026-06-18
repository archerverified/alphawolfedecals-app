// Bake-off spend-ledger logic (Goal 7 D1, extracted for unit tests after the
// fresh-context review). This is the harness's ONLY money rail until the D7
// rails land, so every exceptional path here FAILS CLOSED:
//  - storage read errors that are not "object missing" → throw (route 503s,
//    no provider call is made);
//  - a corrupt/NaN ledger → throw (never compare NaN to a cap — that's the
//    fail-open A10 classic);
//  - spend is recorded as an ESTIMATE before the provider call and trued-up
//    after the image is safely stored, so a crash window never loses spend.

import { AI_CONFIG } from '@alphawolf/db';

export interface BakeoffLedgerEntry {
  at: string;
  label: string;
  modelKey: string;
  requestId: string;
  costUsd: number;
  storedPath: string;
  status: 'estimated' | 'stored' | 'failed';
}

export interface BakeoffLedger {
  totalImages: number;
  totalUsd: number;
  calls: BakeoffLedgerEntry[];
}

export interface LedgerStore {
  download(key: string): Promise<Buffer>;
  upload(key: string, data: Buffer): Promise<void>;
}

export const BAKEOFF_LEDGER_KEY = 'bakeoff/2026-06/ledger.json';

function isNotFoundError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /object not found|not_found|404|no data/i.test(msg);
}

function assertValidLedger(ledger: BakeoffLedger): void {
  if (
    !Number.isFinite(ledger.totalImages) ||
    !Number.isFinite(ledger.totalUsd) ||
    !Array.isArray(ledger.calls)
  ) {
    throw new Error('bake-off ledger is corrupt — refusing to run (fail closed)');
  }
}

/**
 * Load the cumulative ledger. ONLY a confirmed object-missing error yields a
 * fresh ledger; any other failure (network, bad service key, corrupt JSON)
 * throws so the caller refuses to spend.
 */
export async function loadLedger(store: LedgerStore): Promise<BakeoffLedger> {
  let buf: Buffer;
  try {
    buf = await store.download(BAKEOFF_LEDGER_KEY);
  } catch (err) {
    if (isNotFoundError(err)) return { totalImages: 0, totalUsd: 0, calls: [] };
    throw new Error(
      `bake-off ledger unreadable — refusing to run (fail closed): ${err instanceof Error ? err.message : 'unknown'}`,
      { cause: err },
    );
  }
  const ledger = JSON.parse(buf.toString('utf8')) as BakeoffLedger;
  assertValidLedger(ledger);
  return ledger;
}

export async function saveLedger(store: LedgerStore, ledger: BakeoffLedger): Promise<void> {
  await store.upload(BAKEOFF_LEDGER_KEY, Buffer.from(JSON.stringify(ledger, null, 2)));
}

export type CapDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * Projected cap check — counts THIS invocation's planned images and estimated
 * USD against the cumulative caps, not just past spend.
 */
export function checkCaps(ledger: BakeoffLedger, plannedCostsUsd: number[]): CapDecision {
  const caps = AI_CONFIG.bakeoff;
  if (plannedCostsUsd.length > caps.maxImagesPerInvocation) {
    return { allowed: false, reason: `max ${caps.maxImagesPerInvocation} images per invocation` };
  }
  if (ledger.totalImages + plannedCostsUsd.length > caps.maxTotalImages) {
    return {
      allowed: false,
      reason: `cumulative image cap (${caps.maxTotalImages}) would be exceeded`,
    };
  }
  const projected = ledger.totalUsd + plannedCostsUsd.reduce((a, b) => a + b, 0);
  if (projected > caps.maxTotalUsd) {
    return {
      allowed: false,
      reason: `cumulative USD cap ($${caps.maxTotalUsd}) would be exceeded`,
    };
  }
  return { allowed: true };
}

export function hasLabelEntry(ledger: BakeoffLedger, label: string, modelKey: string): boolean {
  return ledger.calls.some((c) => c.label === label && c.modelKey === modelKey);
}

/** Record an estimate BEFORE the provider call (spend survives any crash after submit). */
export function recordEstimate(
  ledger: BakeoffLedger,
  entry: Omit<BakeoffLedgerEntry, 'status' | 'at'>,
): BakeoffLedgerEntry {
  const row: BakeoffLedgerEntry = { ...entry, at: new Date().toISOString(), status: 'estimated' };
  ledger.calls.push(row);
  ledger.totalImages += 1;
  ledger.totalUsd = round4(ledger.totalUsd + row.costUsd);
  return row;
}

/** True-up after the image is stored: swap estimated cost for the actual one. */
export function trueUp(
  ledger: BakeoffLedger,
  row: BakeoffLedgerEntry,
  actual: { costUsd: number; requestId: string; storedPath: string },
): void {
  ledger.totalUsd = round4(ledger.totalUsd - row.costUsd + actual.costUsd);
  row.costUsd = actual.costUsd;
  row.requestId = actual.requestId;
  row.storedPath = actual.storedPath;
  row.status = 'stored';
}

/** Confirmed provider failure — fal never bills failed runs, so release the estimate. */
export function recordFailure(ledger: BakeoffLedger, row: BakeoffLedgerEntry): void {
  ledger.totalUsd = round4(ledger.totalUsd - row.costUsd);
  ledger.totalImages -= 1;
  row.costUsd = 0;
  row.status = 'failed';
}

function round4(n: number): number {
  return Number(n.toFixed(4));
}
