// lib/walk/engine.ts
// Wall-clock walk engine. Elapsed time is always derived from timestamps
// (startedAt, pausedAt, pausedTotal), never from counting ticks, so the
// timer stays correct after the screen locks, the tab sleeps or the page
// reloads. Ticks only refresh the display.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Segment, phaseAt, totalSeconds, PhaseState } from './schedule';

export type ClockState = {
  startedAt: number | null;  // epoch ms
  pausedAt: number | null;   // epoch ms while paused
  pausedTotal: number;       // ms spent paused before the current pause
};

export type ActiveWalk = {
  version: 1;
  name: string;
  planId?: string;
  segments: Segment[];
  clock: ClockState;
  savedAt: number;
};

const ACTIVE_KEY = 'sparkwalk.active.v1';

export function elapsedMs(c: ClockState, now = Date.now()) {
  if (c.startedAt == null) return 0;
  const end = c.pausedAt ?? now;
  return Math.max(0, end - c.startedAt - c.pausedTotal);
}

export async function loadActiveWalk(): Promise<ActiveWalk | null> {
  try {
    const raw = await AsyncStorage.getItem(ACTIVE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw) as ActiveWalk;
    if (w?.version !== 1 || !Array.isArray(w.segments) || !w.clock?.startedAt) return null;
    const total = totalSeconds(w.segments) * 1000;
    // Recoverable if not finished and touched in the last 12 hours.
    if (elapsedMs(w.clock) >= total) return null;
    if (Date.now() - w.savedAt > 12 * 3600 * 1000) return null;
    return w;
  } catch {
    return null;
  }
}

export async function saveActiveWalk(w: ActiveWalk | null) {
  try {
    if (!w) await AsyncStorage.removeItem(ACTIVE_KEY);
    else await AsyncStorage.setItem(ACTIVE_KEY, JSON.stringify({ ...w, savedAt: Date.now() }));
  } catch {}
}

/**
 * Drives the display. `tickMs` is a refresh rate only — it never affects time.
 */
export function useWalkClock(segments: Segment[], initial?: ClockState, tickMs = 250) {
  const [clock, setClock] = useState<ClockState>(initial ?? { startedAt: null, pausedAt: null, pausedTotal: 0 });
  const [now, setNow] = useState(Date.now());
  const clockRef = useRef(clock);
  clockRef.current = clock;

  const running = clock.startedAt != null && clock.pausedAt == null;
  const phase: PhaseState = phaseAt(segments, elapsedMs(clock, now) / 1000);

  useEffect(() => {
    if (!running || phase.done) return;
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [running, phase.done, tickMs]);

  // Recompute immediately when returning from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => { if (s === 'active') setNow(Date.now()); });
    let onVis: (() => void) | undefined;
    if (typeof document !== 'undefined') {
      onVis = () => { if (document.visibilityState === 'visible') setNow(Date.now()); };
      document.addEventListener('visibilitychange', onVis);
    }
    return () => { sub.remove(); if (onVis) document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const start = useCallback(() => {
    const t = Date.now();
    setClock({ startedAt: t, pausedAt: null, pausedTotal: 0 });
    setNow(t);
  }, []);
  const pause = useCallback(() => {
    const c = clockRef.current;
    if (c.startedAt == null || c.pausedAt != null) return;
    const t = Date.now();
    setClock({ ...c, pausedAt: t });
    setNow(t);
  }, []);
  const resume = useCallback(() => {
    const c = clockRef.current;
    if (c.pausedAt == null) return;
    const t = Date.now();
    setClock({ ...c, pausedAt: null, pausedTotal: c.pausedTotal + (t - c.pausedAt) });
    setNow(t);
  }, []);

  return { clock, phase, running, started: clock.startedAt != null, start, pause, resume };
}
