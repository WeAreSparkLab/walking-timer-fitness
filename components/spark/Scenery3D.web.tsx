// components/spark/Scenery3D.web.tsx
// 3D world with a graceful fallback: the 2D scene shows immediately, the 3D
// engine loads on demand and fades in over it. If WebGL is missing, slow, or
// fails, the 2D scene simply stays.
import React, { useEffect, useRef, useState } from 'react';
import type { World } from '../../lib/spark/worlds';
import Scenery from './Scenery';

type Props = {
  world: World; still?: boolean; fadeTo?: string; label?: string; enabled?: boolean;
  /** Travel speed: 0 = stopped, 1 = gentle stroll. Changes ease smoothly. */
  speed?: number;
  /** Frame cap and reduced quality for long sessions (battery). */
  economy?: boolean;
};

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}

export default function Scenery3D({ world, still, fadeTo, label, enabled = true, speed = 1, economy }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handle = useRef<{ dispose(): void; setSpeed(s: number): void } | null>(null);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const [live, setLive] = useState(false);
  const [hide2d, setHide2d] = useState(false);
  const use3d = enabled && world.layers.length > 0;

  useEffect(() => {
    setLive(false); setHide2d(false);
    if (!use3d || !webglOK()) return;
    let dead = false;
    let timer: any;
    import('./world3d/engine')
      .then(m => {
        if (dead || !host.current) return;
        handle.current = m.createWorld(host.current, world, {
          still,
          speed: speedRef.current,
          maxFps: economy ? 30 : undefined,
          lowQuality: economy,
          onReady: () => { if (!dead) { setLive(true); timer = setTimeout(() => !dead && setHide2d(true), 1200); } },
          onFail: () => { if (!dead) { handle.current = null; setLive(false); setHide2d(false); } },
        });
      })
      .catch(() => {});
    return () => { dead = true; clearTimeout(timer); handle.current?.dispose(); handle.current = null; };
  }, [world.id, still, use3d, economy]);

  useEffect(() => { handle.current?.setSpeed(speed); }, [speed]);

  return (
    <div role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}
      style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {!hide2d ? <Scenery world={world} still={still || live} /> : null}
      <div ref={host} style={{ position: 'absolute', inset: 0, opacity: live ? 1 : 0, transition: 'opacity 1000ms ease' }} />
      {fadeTo ? <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `linear-gradient(to bottom, transparent 50%, ${fadeTo} 100%)` }} /> : null}
    </div>
  );
}
