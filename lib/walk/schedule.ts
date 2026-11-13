// lib/walk/schedule.ts
// Single source of truth for interval maths. The creator timeline, the
// duration totals and the running timer all read from these functions,
// so they cannot disagree.
import type { Pace, Interval } from '../storage';

export type Segment = { pace: Pace; seconds: number };

export type WalkStructure = {
  warmup: number;   // seconds
  fast: number;     // seconds
  slow: number;     // seconds
  repeats: number;  // number of fast+slow pairs
  cooldown: number; // seconds
};

export const LIMITS = {
  maxSegmentSeconds: 60 * 60,
  maxRepeats: 20,
  maxTotalSeconds: 4 * 60 * 60,
};

export const PHASE_COPY: Record<Pace, { label: string; short: string; spoken: string; icon: string }> = {
  WARMUP:   { label: 'Warm up',          short: 'Warm up',  spoken: 'Warm up. Start gently.',      icon: 'sunny-outline' },
  FAST:     { label: 'Pick up the pace', short: 'Brisk',    spoken: 'Pick up the pace.',           icon: 'trending-up' },
  SLOW:     { label: 'Ease back',        short: 'Easy',     spoken: 'Ease back. Nice and steady.', icon: 'leaf-outline' },
  COOLDOWN: { label: 'Cool down',        short: 'Cool down', spoken: 'Cool down. Lovely work.',    icon: 'moon-outline' },
};

export type Preset = { id: string; name: string; blurb: string; structure: WalkStructure };

export const PRESETS: Preset[] = [
  { id: 'gentle',  name: 'Gentle walk',         blurb: 'Soft, steady and unhurried',  structure: { warmup: 300, fast: 120, slow: 180, repeats: 3, cooldown: 300 } },
  { id: 'short',   name: 'Short interval walk', blurb: 'A quick lift in the day',     structure: { warmup: 180, fast: 60,  slow: 120, repeats: 4, cooldown: 180 } },
  { id: 'classic', name: 'Classic interval walk', blurb: 'Three-minute swaps',        structure: { warmup: 180, fast: 180, slow: 180, repeats: 5, cooldown: 180 } },
];

export function buildSegments(s: WalkStructure): Segment[] {
  const out: Segment[] = [];
  if (s.warmup > 0) out.push({ pace: 'WARMUP', seconds: s.warmup });
  for (let i = 0; i < s.repeats; i++) {
    if (s.fast > 0) out.push({ pace: 'FAST', seconds: s.fast });
    if (s.slow > 0) out.push({ pace: 'SLOW', seconds: s.slow });
  }
  if (s.cooldown > 0) out.push({ pace: 'COOLDOWN', seconds: s.cooldown });
  return out;
}

/**
 * Recognise the standard shape: [warm up] (brisk, easy) × n [cool down].
 * Returns null for any other sequence (those are edited part by part).
 */
export function structureFromSegments(segs: Segment[]): WalkStructure | null {
  let i = 0;
  const s: WalkStructure = { warmup: 0, fast: 0, slow: 0, repeats: 0, cooldown: 0 };
  if (segs[i]?.pace === 'WARMUP') s.warmup = segs[i++].seconds;
  while (segs[i]?.pace === 'FAST' && segs[i + 1]?.pace === 'SLOW') {
    if (s.repeats && (segs[i].seconds !== s.fast || segs[i + 1].seconds !== s.slow)) return null;
    s.fast = segs[i].seconds; s.slow = segs[i + 1].seconds; s.repeats++; i += 2;
  }
  if (segs[i]?.pace === 'COOLDOWN') s.cooldown = segs[i++].seconds;
  if (i !== segs.length || segs.length === 0) return null;
  return s;
}

export function validateSegments(segs: Segment[]): string | null {
  if (!segs.length) return 'Add at least one part to your walk.';
  if (segs.some(s => !Number.isFinite(s.seconds) || s.seconds <= 0 || s.seconds > LIMITS.maxSegmentSeconds)) return 'Each part needs between 5 seconds and 60 minutes.';
  if (totalSeconds(segs) > LIMITS.maxTotalSeconds) return 'Walks can be up to 4 hours.';
  return null;
}

export function validateStructure(s: WalkStructure): string | null {
  const vals = [s.warmup, s.fast, s.slow, s.cooldown];
  if (vals.some(v => !Number.isFinite(v) || v < 0 || v > LIMITS.maxSegmentSeconds)) return 'Each part can be up to 60 minutes.';
  if (!Number.isInteger(s.repeats) || s.repeats < 0 || s.repeats > LIMITS.maxRepeats) return `Repeats must be between 0 and ${LIMITS.maxRepeats}.`;
  if (s.repeats > 0 && s.fast + s.slow === 0) return 'Give the repeats some time, or set repeats to 0.';
  const total = totalSeconds(buildSegments(s));
  if (total <= 0) return 'Your walk needs at least one part with some time in it.';
  if (total > LIMITS.maxTotalSeconds) return 'Walks can be up to 4 hours.';
  return null;
}

/** Clean legacy {minutes, seconds} intervals into segments, dropping empty ones. */
export function segmentsFromIntervals(ivs: Interval[]): Segment[] {
  return (ivs || [])
    .map(i => ({ pace: i.pace, seconds: Math.max(0, (i.minutes | 0) * 60 + Math.min(59, Math.max(0, i.seconds | 0))) }))
    .filter(s => s.seconds > 0);
}

export function intervalsFromSegments(segs: Segment[]): Interval[] {
  return segs.map(s => ({ pace: s.pace, minutes: Math.floor(s.seconds / 60), seconds: s.seconds % 60 }));
}

export function totalSeconds(segs: Segment[]) {
  return segs.reduce((a, s) => a + s.seconds, 0);
}

export type PhaseState = {
  index: number;          // current segment index (segs.length when finished)
  segment: Segment | null;
  next: Segment | null;
  remainingInSegment: number; // seconds, fractional
  elapsed: number;            // seconds, clamped to total
  remainingTotal: number;
  done: boolean;
};

/** Pure lookup: where in the walk are we after `elapsedSec`? */
export function phaseAt(segs: Segment[], elapsedSec: number): PhaseState {
  const total = totalSeconds(segs);
  const e = Math.max(0, Math.min(elapsedSec, total));
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const end = acc + segs[i].seconds;
    if (e < end) {
      return { index: i, segment: segs[i], next: segs[i + 1] ?? null, remainingInSegment: end - e, elapsed: e, remainingTotal: total - e, done: false };
    }
    acc = end;
  }
  return { index: segs.length, segment: null, next: null, remainingInSegment: 0, elapsed: total, remainingTotal: 0, done: true };
}

export function fmtClock(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

export function fmtMinutes(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} hr ${m % 60} min` : `${h} hr`;
}
