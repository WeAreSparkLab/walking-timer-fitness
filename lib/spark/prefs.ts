// lib/spark/prefs.ts — per-device preferences (theme, cues, power)
import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WorldId = 'woodland' | 'coastal' | 'mountain' | 'garden' | 'simple';

export type Prefs = {
  world: WorldId;
  lowPower: boolean;     // disables scene animation everywhere
  scene3d: boolean;      // 3D worlds on web (falls back to 2D automatically)
  voice: boolean;        // spoken announcements
  chime: boolean;        // soft tone at each change
  vibrate: boolean;
  volume: number;        // 0..1 for chime + voice
  brightMode: boolean;   // light timer for strong sunlight
  keepAwake: boolean;    // Screen Wake Lock where supported
};

export const DEFAULT_PREFS: Prefs = {
  world: 'woodland', lowPower: false, scene3d: true, voice: true, chime: true, vibrate: true,
  volume: 0.7, brightMode: false, keepAwake: true,
};

const KEY = 'sparkwalk.prefs.v1';
let cache: Prefs | null = null;
const listeners = new Set<(p: Prefs) => void>();

export async function loadPrefs(): Promise<Prefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = { ...DEFAULT_PREFS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULT_PREFS };
  }
  return cache!;
}

export async function setPrefs(patch: Partial<Prefs>) {
  const next = { ...(await loadPrefs()), ...patch };
  cache = next;
  listeners.forEach(l => l(next));
  try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); } catch {}
}

export function usePrefs() {
  const [prefs, setLocal] = useState<Prefs>(cache ?? DEFAULT_PREFS);
  useEffect(() => {
    let alive = true;
    loadPrefs().then(p => alive && setLocal(p));
    listeners.add(setLocal);
    return () => { alive = false; listeners.delete(setLocal); };
  }, []);
  const update = useCallback((patch: Partial<Prefs>) => setPrefs(patch), []);
  return [prefs, update] as const;
}

/** True when the OS asks for reduced motion (web only; native defaults false). */
export function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}
