'use client';

// Brief autosave (Goal 5 / B2C-002). Same engine as the canvas useAutosave
// (trailing 1500 ms debounce, 10 s max-wait, visibilitychange/beforeunload
// flush, optimistic rev, stale → reload) pointed at saveBriefAction. Kept as a
// sibling rather than generalising useAutosave: the two docs serialize and
// instrument differently, and the canvas hook is load-bearing for the editor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { saveBriefAction } from '@/lib/actions/brief';
import type { BriefData, BriefStepKey } from '@/lib/brief/schema';

const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 10_000;

export type BriefSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface BriefAutosaveHandle {
  status: BriefSaveStatus;
  lastSavedAt: number | null;
  flushNow: () => void;
}

interface Params {
  projectId: string;
  briefId: string;
  initialRev: number;
  /** Current brief data. Changing identity schedules a save. */
  data: BriefData;
  /** Current wizard step, persisted for resume. */
  currentStep: BriefStepKey;
}

export function useBriefAutosave({
  projectId,
  briefId,
  initialRev,
  data,
  currentStep,
}: Params): BriefAutosaveHandle {
  const [status, setStatus] = useState<BriefSaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const revRef = useRef(initialRev);
  const dataRef = useRef(data);
  dataRef.current = data;
  const stepRef = useRef(currentStep);
  stepRef.current = currentStep;

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedDataRef = useRef<BriefData>(data);
  const savedStepRef = useRef<BriefStepKey>(currentStep);
  const inFlight = useRef(false);
  const pendingFlush = useRef(false);
  const reloadingRef = useRef(false);
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
    const current = dataRef.current;
    // A step change with untouched data still saves: current_step is the
    // resume point, so "navigated, edited nothing, closed the tab" must
    // restore the step they were on (review finding, PR #120).
    if (current === savedDataRef.current && stepRef.current === savedStepRef.current) {
      setStatus((s) => (s === 'pending' ? 'idle' : s));
      return;
    }
    if (inFlight.current) {
      pendingFlush.current = true;
      return;
    }
    inFlight.current = true;
    clearTimers();
    setStatus('saving');

    const snapshot = current;
    const stepSnapshot = stepRef.current;
    let saveOk = false;
    try {
      const res = await saveBriefAction({
        projectId,
        briefId,
        expectedRev: revRef.current,
        data: snapshot,
        currentStep: stepSnapshot,
      });
      if (res.ok) {
        saveOk = true;
        revRef.current = res.rev;
        savedDataRef.current = snapshot;
        savedStepRef.current = stepSnapshot;
        setLastSavedAt(Date.now());
        setStatus(dataRef.current === snapshot ? 'saved' : 'pending');
      } else if (res.reason === 'stale') {
        reloadingRef.current = true;
        toast.message('Brief saved elsewhere — reloading');
        setStatus('error');
        if (typeof window !== 'undefined') {
          window.setTimeout(() => window.location.reload(), 600);
        }
      } else {
        toast.error('Could not save your brief.');
        setStatus('error');
      }
    } catch {
      toast.error('Could not save your brief.');
      setStatus('error');
    } finally {
      inFlight.current = false;
      if (!reloadingRef.current) {
        if (pendingFlush.current) {
          pendingFlush.current = false;
          doSaveRef.current();
        } else if (saveOk && dataRef.current !== savedDataRef.current) {
          scheduleRef.current();
        }
      }
    }
  }, [projectId, briefId, clearTimers]);
  doSaveRef.current = () => void doSave();

  const scheduleRef = useRef<() => void>(() => {});
  const schedule = useCallback(() => {
    if (reloadingRef.current) return;
    setStatus('pending');
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => void doSave(), DEBOUNCE_MS);
    if (!maxWaitTimer.current) {
      maxWaitTimer.current = setTimeout(() => void doSave(), MAX_WAIT_MS);
    }
  }, [doSave]);
  scheduleRef.current = schedule;

  const flushNow = useCallback(() => {
    void doSave();
  }, [doSave]);

  useEffect(() => {
    if (data === savedDataRef.current) return;
    schedule();
  }, [data, schedule]);

  // Persist step navigation AFTER the render commits (stepRef is current by
  // then) — a synchronous flush inside the click handler would record the
  // step being left, not the one being entered (review finding, PR #120).
  useEffect(() => {
    if (currentStep === savedStepRef.current) return;
    void doSave();
  }, [currentStep, doSave]);

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
