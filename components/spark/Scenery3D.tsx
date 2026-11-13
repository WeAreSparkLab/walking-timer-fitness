// components/spark/Scenery3D.tsx — native builds use the 2D scene.
// (The 3D engine is web-only for now; see Scenery3D.web.tsx.)
import React from 'react';
import Scenery from './Scenery';
import type { World } from '../../lib/spark/worlds';

export default function Scenery3D({ world, still, fadeTo, label }: { world: World; still?: boolean; fadeTo?: string; label?: string; enabled?: boolean }) {
  return <Scenery world={world} still={still} fadeTo={fadeTo} label={label} />;
}
