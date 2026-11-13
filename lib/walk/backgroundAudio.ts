// lib/walk/backgroundAudio.ts
// Keeps cues working while the phone is locked (web).
//
// How: browsers pause JavaScript timers when the screen locks, but they keep
// an active media session playing (that is how music apps work). So when the
// walk starts we:
//   1. play a silent looping <audio> track, which holds the media session open
//      and also makes iPhones play sound with the silent switch on,
//   2. schedule every remaining chime in advance on the Web Audio clock, which
//      keeps running while the media session is alive,
//   3. publish the walk to the lock screen (Media Session API) with
//      play/pause controls.
// None of this affects timing: the walk clock is still timestamp-based.
import { Platform } from 'react-native';
import type { Segment } from './schedule';
import { getAudioContext } from './cues';

type Pace = Segment['pace'] | 'DONE';

let keepAlive: HTMLAudioElement | null = null;
let scheduled: AudioScheduledSourceNode[] = [];

function silentWavUrl() {
  // 1 second of silence, 8 kHz mono 8-bit PCM
  const rate = 8000, n = rate, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const s = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  s(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

function toneAt(ctx: AudioContext, freq: number, t: number, dur: number, volume: number) {
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
  scheduled.push(osc);
}

/** Same patterns as the foreground chimes: rising for brisk, falling for easy. */
function chimeAt(ctx: AudioContext, pace: Pace, t: number, volume: number) {
  if (pace === 'FAST') { toneAt(ctx, 660, t, 0.18, volume); toneAt(ctx, 880, t + 0.2, 0.25, volume); }
  else if (pace === 'SLOW') { toneAt(ctx, 784, t, 0.18, volume); toneAt(ctx, 587, t + 0.2, 0.3, volume); }
  else if (pace === 'DONE') { toneAt(ctx, 523, t, 0.3, volume); toneAt(ctx, 659, t + 0.18, 0.3, volume); toneAt(ctx, 784, t + 0.36, 0.5, volume); }
  else toneAt(ctx, 698, t, 0.45, volume);
}

/** A soft single tick 10 seconds before each change. */
function tickAt(ctx: AudioContext, t: number, volume: number) {
  toneAt(ctx, 1046, t, 0.08, volume * 0.5);
}

export const backgroundAudioSupported = () =>
  Platform.OS === 'web' && typeof window !== 'undefined' && !!(window.AudioContext || (window as any).webkitAudioContext);

/** Must be called from a tap (Start / Resume). */
export function startKeepAlive() {
  if (!backgroundAudioSupported()) return;
  try {
    if (!keepAlive) {
      keepAlive = new Audio(silentWavUrl());
      keepAlive.loop = true;
      keepAlive.setAttribute('playsinline', '');
    }
    keepAlive.play().catch(() => {});
  } catch {}
}

export function stopKeepAlive() {
  try { keepAlive?.pause(); } catch {}
}

export function cancelScheduled() {
  for (const n of scheduled) { try { n.stop(); } catch {} }
  scheduled = [];
}

/**
 * Schedule every remaining cue for the walk on the audio clock.
 * `elapsedSec` is how far into the walk we are right now.
 */
export function scheduleCues(segments: Segment[], elapsedSec: number, opts: { chime: boolean; volume: number; headsUp: boolean }) {
  cancelScheduled();
  const ctx = getAudioContext();
  if (!ctx || !opts.chime || opts.volume <= 0) return;
  const now = ctx.currentTime;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const end = acc + segments[i].seconds;
    const next = segments[i + 1];
    const at = end - elapsedSec; // seconds from now
    if (at > 0.3) {
      chimeAt(ctx, next ? next.pace : 'DONE', now + at, opts.volume);
      if (opts.headsUp && next && segments[i].seconds >= 40 && at > 10.3) tickAt(ctx, now + at - 10, opts.volume);
    }
    acc = end;
  }
}

/** Lock-screen card with play/pause. */
export function setLockScreen(title: string, subtitle: string, handlers: { play: () => void; pause: () => void }, playing: boolean) {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    const ms = (navigator as any).mediaSession;
    const MM = (window as any).MediaMetadata;
    if (MM) ms.metadata = new MM({ title, artist: 'Spark Walk', album: subtitle, artwork: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }] });
    ms.playbackState = playing ? 'playing' : 'paused';
    ms.setActionHandler('play', handlers.play);
    ms.setActionHandler('pause', handlers.pause);
  } catch {}
}

export function clearLockScreen() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  try {
    const ms = (navigator as any).mediaSession;
    ms.metadata = null;
    ms.playbackState = 'none';
    ms.setActionHandler('play', null);
    ms.setActionHandler('pause', null);
  } catch {}
}
