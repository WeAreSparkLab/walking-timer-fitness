// lib/walk/sharedClock.ts
// Every walker computes the current phase from the same server timestamps
// (started_at, paused_at, paused_total_ms). Device clocks are corrected with
// a measured offset to the server clock, so a phone that is a minute out
// still shows the same phase as everyone else.

let offsetMs = 0;
let measured = false;

/** Measure (server - device) clock offset, NTP-style, keeping the fastest round trip. */
export async function syncServerClock(fetchServerNow: () => Promise<string>, samples = 4) {
  let best: { rtt: number; offset: number } | null = null;
  for (let i = 0; i < samples; i++) {
    try {
      const t0 = Date.now();
      const server = new Date(await fetchServerNow()).getTime();
      const t1 = Date.now();
      const rtt = t1 - t0;
      const offset = server - (t0 + rtt / 2);
      if (!best || rtt < best.rtt) best = { rtt, offset };
    } catch {}
  }
  if (best) { offsetMs = best.offset; measured = true; }
  return { offsetMs, measured, rtt: best?.rtt ?? null };
}

export const serverNow = () => Date.now() + offsetMs;
export const clockMeasured = () => measured;

export type SharedTimeline = {
  started_at: string | null;
  paused_at: string | null;
  paused_total_ms: number | string | null;
};

/**
 * Milliseconds into the walk for everyone. Negative while counting down.
 * `personalPausedMs` lets one walker step aside without changing anyone else.
 */
export function sharedElapsedMs(t: SharedTimeline, personalPausedMs = 0, now = serverNow()) {
  if (!t.started_at) return null;
  const start = new Date(t.started_at).getTime();
  const end = t.paused_at ? new Date(t.paused_at).getTime() : now;
  return end - start - Number(t.paused_total_ms || 0) - personalPausedMs;
}
