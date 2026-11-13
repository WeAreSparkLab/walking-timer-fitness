// components/spark/Scenery.web.tsx
// Procedural, layered SVG landscapes. No image downloads, deterministic,
// and every animation is CSS-only so it can be switched off instantly
// (low-power mode, prefers-reduced-motion, or `still`).
import React, { useMemo } from 'react';
import type { World } from '../../lib/spark/worlds';

type Props = { world: World; still?: boolean; fadeTo?: string; style?: React.CSSProperties; label?: string; focus?: 'ground' | 'horizon' };

const W = 400, H = 300;

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type RidgeOpts = { base: number; amp: number; freq: number; sharp?: boolean; seed: number };
function ridgeFn(o: RidgeOpts) {
  const r = rng(o.seed);
  const ph = [r() * 6.28, r() * 6.28, r() * 6.28];
  return (x: number) => {
    const u = (x / W) * o.freq;
    let n = 0.6 * Math.sin(u * 2.1 + ph[0]) + 0.3 * Math.sin(u * 4.7 + ph[1]) + 0.12 * Math.sin(u * 11.3 + ph[2]);
    if (o.sharp) n = 1 - Math.abs(Math.sin(u * 1.6 + ph[0])) * 1.4 + 0.25 * Math.sin(u * 6.2 + ph[1]);
    return o.base - o.amp * (n * 0.5 + 0.5);
  };
}
function ridgePath(f: (x: number) => number) {
  let d = `M0,${H} L0,${f(0).toFixed(1)}`;
  for (let x = 4; x <= W; x += 4) d += ` L${x},${f(x).toFixed(1)}`;
  return d + ` L${W},${H} Z`;
}
function treeLine(f: (x: number) => number, seed: number, size: number, spacing: number, mix = 0.7) {
  const r = rng(seed);
  let d = '';
  for (let x = -10; x < W + 10; x += spacing * (0.6 + r() * 0.8)) {
    const y = f(Math.max(0, Math.min(W, x))) + 2;
    const h = size * (0.7 + r() * 0.6);
    if (r() < mix) {
      const w = h * 0.32;
      d += `M${(x - w).toFixed(1)},${y.toFixed(1)} L${x.toFixed(1)},${(y - h).toFixed(1)} L${(x + w).toFixed(1)},${y.toFixed(1)} Z `;
    } else {
      const rr = h * 0.38;
      const cy = y - h * 0.55;
      d += `M${(x - rr).toFixed(1)},${cy.toFixed(1)} a${rr.toFixed(1)},${rr.toFixed(1)} 0 1,1 ${(rr * 2).toFixed(1)},0 L${(x + rr * 0.2).toFixed(1)},${y} L${(x - rr * 0.2).toFixed(1)},${y} Z `;
    }
  }
  return d;
}

const CSS = `
.sw-scene .sw-mist{animation:sw-drift 38s ease-in-out infinite alternate}
.sw-scene .sw-rays{animation:sw-rays 9s ease-in-out infinite alternate;transform-origin:center}
.sw-scene .sw-waves{animation:sw-waves 14s linear infinite}
.sw-scene .sw-sway{animation:sw-sway 6s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:bottom}
@keyframes sw-drift{from{transform:translateX(-18px)}to{transform:translateX(18px)}}
@keyframes sw-rays{from{opacity:.35}to{opacity:.7}}
@keyframes sw-waves{from{transform:translateX(0)}to{transform:translateX(-40px)}}
@keyframes sw-sway{from{transform:rotate(-1.5deg)}to{transform:rotate(1.5deg)}}
.sw-still *{animation:none!important}
@media (prefers-reduced-motion: reduce){.sw-scene *{animation:none!important}}
`;

export default function Scenery({ world, still, fadeTo, style, label, focus = 'horizon' }: Props) {
  const id = world.id;
  const art = useMemo(() => build(world), [world]);
  if (world.layers.length === 0) {
    return <div aria-hidden style={{ position: 'absolute', inset: 0, background: `radial-gradient(120% 80% at 50% 0%, ${world.sky[2]} 0%, ${world.sky[0]} 70%)`, ...style }} />;
  }
  return (
    <div className={`sw-scene ${still ? 'sw-still' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }}>
      <style>{CSS}</style>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio={focus === 'horizon' ? 'xMidYMid slice' : 'xMidYMax slice'} width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={world.sky[0]} />
            <stop offset="0.55" stopColor={world.sky[1]} />
            <stop offset="1" stopColor={world.sky[2]} />
          </linearGradient>
          <radialGradient id={`sun-${id}`}>
            <stop offset="0" stopColor={world.sun.glow} />
            <stop offset="1" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
          <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.55" stopColor={fadeTo ?? '#000'} stopOpacity="0" />
            <stop offset="1" stopColor={fadeTo ?? '#000'} stopOpacity={fadeTo ? 1 : 0} />
          </linearGradient>
          <linearGradient id={`sea-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9DBCCB" />
            <stop offset="1" stopColor="#2E5470" />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill={`url(#sky-${id})`} />
        <circle cx={world.sun.x * W} cy={world.sun.y * H} r={world.sun.r * 4} fill={`url(#sun-${id})`} />
        <circle cx={world.sun.x * W} cy={world.sun.y * H} r={world.sun.r} fill={world.sun.color} opacity={0.95} />
        {art}
        <rect width={W} height={H} fill={`url(#fade-${id})`} />
      </svg>
    </div>
  );
}

function build(w: World) {
  const L = w.layers;
  const sx = w.sun.x * W, sy = w.sun.y * H;
  const mist = (y: number, o = 0.35) => (
    <g className="sw-mist" opacity={o}>
      <ellipse cx={120} cy={y} rx={180} ry={10} fill={w.haze} />
      <ellipse cx={320} cy={y + 6} rx={160} ry={8} fill={w.haze} />
    </g>
  );
  const trail = (top: number) => (
    <path d={`M${W / 2 - 3},${top} C${W / 2 + 30},${top + 40} ${W / 2 - 70},${H - 60} ${W / 2 - 40},${H} L${W / 2 + 70},${H} C${W / 2 + 10},${H - 60} ${W / 2 + 40},${top + 40} ${W / 2 + 3},${top} Z`}
      fill={w.haze} opacity={0.42} />
  );

  if (w.id === 'woodland') {
    const r0 = ridgeFn({ base: 170, amp: 30, freq: 3, seed: 11 });
    const r1 = ridgeFn({ base: 192, amp: 22, freq: 4, seed: 12 });
    const r2 = ridgeFn({ base: 222, amp: 18, freq: 5, seed: 13 });
    const r3 = ridgeFn({ base: 262, amp: 14, freq: 3, seed: 14 });
    return (
      <>
        <g className="sw-rays" opacity={0.5}>
          {[-0.5, -0.2, 0.15, 0.45].map((a, i) => (
            <path key={i} d={`M${sx},${sy} L${sx + Math.sin(a) * 420 - 14},${sy + Math.cos(a) * 420} L${sx + Math.sin(a) * 420 + 14},${sy + Math.cos(a) * 420} Z`} fill={w.sun.glow} opacity={0.35} />
          ))}
        </g>
        <path d={ridgePath(r0)} fill={L[0]} />
        <path d={treeLine(r0, 21, 10, 7, 0.8)} fill={L[0]} />
        {mist(186)}
        <path d={ridgePath(r1)} fill={L[1]} />
        <path d={treeLine(r1, 22, 18, 10)} fill={L[1]} />
        <path d={ridgePath(r2)} fill={L[2]} />
        <path d={treeLine(r2, 23, 34, 16)} fill={L[2]} />
        {mist(236, 0.22)}
        <path d={ridgePath(r3)} fill={L[3]} />
        {trail(232)}
        <path d={treeLine(ridgeFn({ base: 300, amp: 6, freq: 2, seed: 15 }), 24, 26, 13, 0.6)} fill={L[3]} />
        <path d={ridgePath(ridgeFn({ base: 304, amp: 8, freq: 2, seed: 16 }))} fill={L[4]} />
      </>
    );
  }
  if (w.id === 'coastal') {
    const head = ridgeFn({ base: 176, amp: 26, freq: 1.6, seed: 31 });
    // Headland on the left that slopes gently down into the sea
    const cliff = (x: number) => 206 + 70 / (1 + Math.exp(-(x - 170) / 22)) + 6 * Math.sin(x / 23);
    const near = ridgeFn({ base: 278, amp: 22, freq: 1.5, seed: 33 });
    return (
      <>
        <path d={`M0,${H} L0,${head(0)} ${Array.from({ length: 30 }, (_, i) => { const x = i * 6; return `L${x},${head(x)}`; }).join(' ')} L180,176 L180,${H} Z`} fill={L[0]} opacity={0.85} />
        <rect x={0} y={176} width={W} height={H - 176} fill={`url(#sea-${w.id})`} />
        <ellipse cx={sx} cy={186} rx={60} ry={4} fill={w.sun.color} opacity={0.5} />
        <g className="sw-waves" opacity={0.55}>
          {Array.from({ length: 9 }, (_, i) => {
            const y = 184 + i * i * 1.4;
            let d = `M-40,${y}`;
            for (let x = -40; x <= W + 40; x += 20) d += ` q10,${-1.2 - i * 0.2} 20,0`;
            return <path key={i} d={d} stroke="#EAF3F7" strokeWidth={0.5 + i * 0.12} fill="none" opacity={0.25 + i * 0.05} />;
          })}
        </g>
        <path d={ridgePath(cliff)} fill={L[2]} />
        <path d={ridgePath(near)} fill={L[3]} />
        <path d={`M${W},${near(W) + 2} C300,${near(300) + 8} 240,${H - 20} 210,${H} L250,${H} C280,${H - 20} 330,${near(330) + 14} ${W},${near(W) + 12} Z`} fill={w.haze} opacity={0.38} />
        <path d={ridgePath(ridgeFn({ base: 304, amp: 10, freq: 2, seed: 34 }))} fill={L[4]} />
      </>
    );
  }
  if (w.id === 'mountain') {
    const p0 = ridgeFn({ base: 200, amp: 90, freq: 2.4, sharp: true, seed: 41 });
    const p1 = ridgeFn({ base: 210, amp: 50, freq: 3.2, sharp: true, seed: 42 });
    const h0 = ridgeFn({ base: 236, amp: 26, freq: 2.5, seed: 43 });
    const h1 = ridgeFn({ base: 268, amp: 20, freq: 2, seed: 44 });
    return (
      <>
        <clipPath id="snow"><rect x={0} y={0} width={W} height={142} /></clipPath>
        <path d={ridgePath(p0)} fill={L[0]} />
        <path d={ridgePath(p0)} fill="#F4EEF0" opacity={0.75} clipPath="url(#snow)" />
        {mist(198, 0.45)}
        <path d={ridgePath(p1)} fill={L[1]} />
        <path d={ridgePath(h0)} fill={L[2]} />
        <path d={treeLine(h0, 45, 12, 9, 0.9)} fill={L[2]} />
        {mist(244, 0.25)}
        <path d={ridgePath(h1)} fill={L[3]} />
        {trail(250)}
        <path d={ridgePath(ridgeFn({ base: 306, amp: 14, freq: 2.2, seed: 46 }))} fill={L[4]} />
      </>
    );
  }
  // garden
  const g0 = ridgeFn({ base: 196, amp: 16, freq: 2, seed: 51 });
  const hedge = (base: number, seed: number, rad: number, color: string) => {
    const r = rng(seed); let d = '';
    for (let x = -10; x < W + 20; x += rad * 1.3) { const rr = rad * (0.8 + r() * 0.4); d += `M${x - rr},${base} a${rr},${rr} 0 1,1 ${rr * 2},0 Z `; }
    return <><path d={d} fill={color} /><rect x={0} y={base} width={W} height={H - base} fill={color} /></>;
  };
  const r = rng(57);
  const palette = ['#F2B4C6', '#FFD9A0', '#FFFFFF', '#C9B6F2', '#F49AA8'];
  return (
    <>
      <path d={ridgePath(g0)} fill={L[0]} />
      <path d={treeLine(g0, 52, 22, 26, 0.2)} fill={L[0]} />
      {mist(206, 0.3)}
      {hedge(226, 53, 14, L[1])}
      {hedge(250, 54, 18, L[2])}
      {trail(246)}
      <g className="sw-sway">
        {Array.from({ length: 70 }, (_, i) => {
          const y = 254 + r() * 46, x = r() * W, s = 0.8 + (y - 254) / 18;
          if (Math.abs(x - W / 2) < (y - 240) * 0.9) return null;
          return <circle key={i} cx={x} cy={y} r={s} fill={palette[i % palette.length]} opacity={0.85} />;
        })}
      </g>
      {hedge(296, 56, 26, L[4])}
    </>
  );
}
