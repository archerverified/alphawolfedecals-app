// Regression test for the autosave re-entry race (PR #38 fixup).
//
// Before the fix, a flush that arrived while a save was in flight was dropped:
// doSave() returned early without remembering the request, so the trailing edit
// only persisted on the next debounce (or never, on unload). The fix sets a
// `pendingFlush` ref and re-runs doSave immediately when the in-flight save
// settles. This test fires two flushes — the second mid-flight — and asserts the
// action runs exactly twice, with the second call carrying the latest document.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { factory, serializeDocument } from '@alphawolf/canvas';
import { useAutosave } from './useAutosave';

const { saveMock } = vi.hoisted(() => ({ saveMock: vi.fn() }));

vi.mock('@/lib/actions/project', () => ({ saveCanvasAction: saveMock }));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() },
}));

beforeEach(() => {
  saveMock.mockReset();
});

describe('useAutosave re-entry race', () => {
  it('re-runs the save with the latest doc when a flush lands mid-save', async () => {
    // Three distinct document identities (the hook compares by reference).
    const d0 = factory.newDocument('veh-1');
    const d1 = { ...d0, seq: 1 };
    const d2 = { ...d0, seq: 2 };

    // The action returns promises we resolve by hand, simulating a slow save.
    const resolvers: Array<(v: { ok: true; rev: number }) => void> = [];
    saveMock.mockImplementation(
      () => new Promise<{ ok: true; rev: number }>((res) => resolvers.push(res)),
    );

    const { result, rerender } = renderHook(
      ({ doc }) =>
        useAutosave({
          projectId: 'p1',
          versionId: 'v1',
          initialRev: 0,
          doc,
        }),
      { initialProps: { doc: d0 } },
    );

    // Edit, then force a flush — the first save goes in flight.
    act(() => rerender({ doc: d1 }));
    act(() => result.current.flushNow());
    expect(saveMock).toHaveBeenCalledTimes(1);

    // Edit again and flush while the first save is still pending.
    act(() => rerender({ doc: d2 }));
    act(() => result.current.flushNow());
    // Still one call: the second flush is queued, not dropped, not duplicated.
    expect(saveMock).toHaveBeenCalledTimes(1);

    // Resolve the first save → the finally block must immediately re-run doSave.
    await act(async () => {
      resolvers[0]?.({ ok: true, rev: 1 });
    });

    expect(saveMock).toHaveBeenCalledTimes(2);
    // The second call must carry the latest document (d2), not the stale d1.
    expect(saveMock.mock.calls[1]?.[0].canvasState).toEqual(serializeDocument(d2));
    expect(saveMock.mock.calls[0]?.[0].canvasState).toEqual(serializeDocument(d1));

    // Drain the second save so no timers/promises leak into the next test.
    await act(async () => {
      resolvers[1]?.({ ok: true, rev: 2 });
    });
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(result.current.status).toBe('saved');
  });
});
