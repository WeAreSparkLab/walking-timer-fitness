// lib/walk/cues.ts — optional audio, voice, vibration and wake lock.
// Every cue fails silently: a missing capability must never break timing.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import type { Pace } from '../storage';

let ctx: AudioContext | null = null;

/** Call from a user gesture (Start / Resume) so browsers allow sound later. */
export function unlockAudio() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') ctx.resume();
    // iOS needs speech primed inside a gesture too.
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance('');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch {}
}

function tone(freq: number, startOffset: number, dur: number, volume: number) {
  if (!ctx) return;
  const t = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.35 * volume), t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

/** Distinct patterns so pace can be told apart without looking: rising for brisk, falling for easy. */
export function chime(pace: Pace | 'DONE', volume: number) {
  if (Platform.OS !== 'web' || !ctx || volume <= 0) return;
  try {
    if (pace === 'FAST') { tone(660, 0, 0.18, volume); tone(880, 0.2, 0.25, volume); }
    else if (pace === 'SLOW') { tone(784, 0, 0.18, volume); tone(587, 0.2, 0.3, volume); }
    else if (pace === 'DONE') { tone(523, 0, 0.3, volume); tone(659, 0.18, 0.3, volume); tone(784, 0.36, 0.5, volume); }
    else { tone(698, 0, 0.45, volume); }
  } catch {}
}

export function speak(text: string, volume: number) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !('speechSynthesis' in window) || volume <= 0) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-GB';
    u.rate = 0.98;
    u.volume = volume;
    const gb = window.speechSynthesis.getVoices().find(v => v.lang === 'en-GB');
    if (gb) u.voice = gb;
    window.speechSynthesis.speak(u);
  } catch {}
}

export function buzz(pace: Pace | 'DONE') {
  try {
    if (Platform.OS === 'web') {
      const pattern = pace === 'FAST' ? [120, 80, 120] : pace === 'DONE' ? [200, 100, 200, 100, 300] : [250];
      (navigator as any).vibrate?.(pattern);
    } else {
      Haptics.notificationAsync(pace === 'DONE' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
    }
  } catch {}
}

export const capabilities = () => ({
  speech: Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window,
  vibrate: Platform.OS !== 'web' || (typeof navigator !== 'undefined' && 'vibrate' in navigator),
  wakeLock: Platform.OS === 'web' && typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  chime: Platform.OS === 'web',
});

/** Screen Wake Lock: keeps the screen on while visible; re-acquired on return. */
export function createWakeLock(onChange: (held: boolean) => void) {
  let sentinel: any = null;
  let wanted = false;
  const acquire = async () => {
    if (!wanted || sentinel || !capabilities().wakeLock || document.visibilityState !== 'visible') return;
    try {
      sentinel = await (navigator as any).wakeLock.request('screen');
      onChange(true);
      sentinel.addEventListener('release', () => { sentinel = null; onChange(false); });
    } catch { onChange(false); }
  };
  const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
  return {
    enable() {
      wanted = true;
      if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);
      acquire();
    },
    disable() {
      wanted = false;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVis);
      try { sentinel?.release(); } catch {}
      sentinel = null;
      onChange(false);
    },
  };
}
