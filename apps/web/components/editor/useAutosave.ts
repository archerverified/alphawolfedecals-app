'use client';

// Autosave (ADR-0006 §4). Trailing-edge debounce (1500 ms idle) with a 10 s
// hard max-wait, plus a forced flush on visibilitychange:hidden and
// beforeunload. NO leading edge — we never write half-finished interaction
// states. Concurrency is optimistic via `rev`: we send the rev we last loaded
// with; on { ok:false, reason:'stale' } another tab advanced the row, so we toast
// and reload (single-editor last-write-wins, not co-editing).

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { serializeDocument } from '@alphawolf/canvas';
import type { CanvasDocument } from '@alphawolf/canvas';
import { saveCanvasAction } from '@/lib/actions/project';

const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 10_000;

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveHandle {
  status: SaveStatus;
  /** Last successful save time (ms epoch), or null. */
  lastSavedAt: number | null;
  /** Force an immediate flush (e.g. a "Save now" affordance). */
  flushNow: () => void;
}

interface Params {
  projectId: string;
  versionId: string;
  initialRev: number;
  /** The current document. Changing identity schedules a save. */
  doc: CanvasDocument;
}

export function useAutosave({ projectId, versionId, initialRev, doc }: Params): AutosaveHandle {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const revRef = useRef(initialRev);
  const docRef = useRef(doc);
  docRef.current = doc;

  // Timers.
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Snapshot of the doc identity we last *persisted*, to skip no-op saves.
  const savedDocRef = useRef<CanvasDocument>(doc);
  // Guard against overlapping saves.
  const inFlight = useRef(false);
  // A flush (flushNow / visibilitychange / beforeunload) that arrived while a
  // save was in flight. We re-run doSave immediately when the current one
  // settles so the trailing edit is never dropped on the floor.
  const pendingFlush = useRef(false);
  const reloadingRef = useRef(false);
  // Self-reference so the `finally` block can re-invoke doSave without a
  // circular useCallback dependency (mirrors scheduleRef below).
  const doSaveRef = useRef<() => void>(() => {});

  const clearTimers = useCallback(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    if (maxWaitTimer.current) {
      clearTimeout(maxWaitTimer.current);
      maxWaitTimer.current = null;
    }
  }, []);

  const doSave = useCallback(async () => {
    if (reloadingRef.current) return;
    const current = docRef.current;
    // Nothing changed since the last persisted snapshot.
    if (current === savedDocRef.current) {
      setStatus((s) => (s === 'pending' ? 'idle' : s));
      return;
    }
    // A save is already running: remember that another flush is wanted and bail.
    // The in-flight save's `finally` will re-run us with the latest doc.
    if (inFlight.current) {
      pendingFlush.current = true;
      return;
    }
    inFlight.current = true;
    clearTimers();
    setStatus('saving');

    const snapshot = current;
    let saveOk = false;
    try {
      const res = await saveCanvasAction({
        projectId,
        versionId,
        expectedRev: revRef.current,
        canvasState: serializeDocument(snapshot) as unknown as Record<string, unknown>,
      });
      if (res.ok) {
        saveOk = true;
        revRef.current = res.rev;
        savedDocRef.current = snapshot;
        setLastSavedAt(Date.now());
        // If the doc moved on while saving, schedule another pass.
        setStatus(docRef.current === snapshot ? 'saved' : 'pending');
      } else if (res.reason === 'stale') {
        reloadingRef.current = true;
        toast.message('Saved elsewhere — reloading');
        setStatus('error');
        if (typeof window !== 'undefined') {
          window.setTimeout(() => window.location.reload(), 600);
        }
      } else {
        toast.error('Could not save your changes.');
        setStatus('error');
      }
    } catch {
      toast.error('Could not save your changes.');
      setStatus('error');
    } finally {
      inFlight.current = false;
      if (!reloadingRef.current) {
        if (pendingFlush.current) {
          // A flush was requested mid-save — honour it NOW, not on the debounce.
          pendingFlush.current = false;
          doSaveRef.current();
        } else if (saveOk && docRef.current !== savedDocRef.current) {
          // Save succeeded but newer edits landed — debounce the next pass.
          scheduleRef.current();
        }
        // On a hard error we deliberately do NOT auto-reschedule: status stays
        // 'error' so the "Save failed — retry" button shows. A subsequent edit
        // (the doc-change effect) or the retry button re-arms the save.
      }
    }
  }, [projectId, versionId, clearTimers]);
  doSaveRef.current = () => void doSave();

  // Hold `schedule` in a ref so `doSave` can re-arm without a circular dep.
  const scheduleRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    if (reloadingRef.current) return;
    setStatus('pending');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void doSave(), DEBOUNCE_MS);
    // Arm the hard max-wait only if not already armed.
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => void doSave(), MAX_WAIT_MS);
    }
  }, [doSave]);
  scheduleRef.current = schedule;

  const flushNow = useCallback(() => {
    void doSave();
  }, [doSave]);

  // Schedule a save whenever the document identity changes.
  useEffect(() => {
    if (doc === savedDocRef.current) return;
    schedule();
  }, [doc, schedule]);

  // Flush on tab hide / unload so in-flight edits are not lost.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') void doSave();
    };
    const onBeforeUnload = () => {
      void doSave();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('beforeunload', onBeforeUnload);
      clearTimers();
    };
  }, [doSave, clearTimers]);

  return { status, lastSavedAt, flushNow };
}
