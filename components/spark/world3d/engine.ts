// components/spark/world3d/engine.ts
// Real-time 3D walking worlds (web only, loaded on demand).
// Everything is generated in code: no model or texture downloads.
// The landscape repeats seamlessly every LOOP metres, so the camera can
// stroll forward along the path forever.
import * as THREE from 'three';
import type { World } from '../../../lib/spark/worlds';

export type WorldHandle = { dispose(): void };
type Opts = { still?: boolean; onReady?: () => void; onFail?: () => void };

const LOOP = 160;
const TILES = 4;
const TAU = Math.PI * 2;
const W = TAU / LOOP;

type Cfg = {
  amp: number;
  ground: [string, string];
  path: string;
  sky: [string, string, string]; // top, middle, horizon (= fog colour)
  sun: [number, number, number];
  sunColor: string;
  fog: [number, number];
  conifers: number; broadleaf: number; bushes: number; flowers: number;
  leaf: string[]; bush: string[]; bloom: string[];
  water?: boolean;
  open?: number; // metres of open meadow either side of the path
  peaks?: 'alpine' | 'hills';
  motes?: string;
  fall?: boolean; // motes fall like leaves or snow instead of drifting
};

const CFG: Record<string, Cfg> = {
  woodland: {
    amp: 7, ground: ['#33502d', '#5f7d42'], path: '#b59a6c',
    sky: ['#6d93b3', '#cfd9bd', '#f0dfb2'], sun: [0.45, 0.3, -1], sunColor: '#ffdca6', fog: [6, 115],
    conifers: 520, broadleaf: 380, bushes: 220, flowers: 160,
    leaf: ['#2f5a34', '#3f6f3a', '#55803e', '#7c8f3c'], bush: ['#3d6a36', '#557d3c'], bloom: ['#fff3c9', '#e7d9ff'],
    peaks: 'hills', motes: '#ffe9b0',
  },
  coastal: {
    amp: 5, ground: ['#6b8a4d', '#9aab68'], path: '#dccba2',
    sky: ['#3d78b6', '#a3c9e4', '#f6e6cc'], sun: [0.85, 0.3, -1], sunColor: '#fff0d2', fog: [45, 240],
    conifers: 0, broadleaf: 26, bushes: 300, flowers: 420,
    leaf: ['#5d8046', '#6f9150'], bush: ['#57793f', '#6d8c45', '#8a9a48'], bloom: ['#ffd84d', '#ffffff', '#f6a6c1'],
    water: true,
  },
  mountain: {
    amp: 9, ground: ['#4a6b43', '#829a5a'], path: '#c2b08e',
    sky: ['#3f5296', '#c59aaa', '#fbd6ad'], sun: [-0.7, 0.42, 0.25], sunColor: '#ffd3a3', fog: [45, 250],
    conifers: 240, broadleaf: 20, bushes: 90, flowers: 420, open: 17,
    leaf: ['#2d5637', '#3a6a40', '#4d7a45'], bush: ['#4b7040', '#62854a'], bloom: ['#ffffff', '#c9b6f2', '#ffe08a'],
    peaks: 'alpine',
  },
  autumn: {
    amp: 6, ground: ['#6b5a2e', '#9a8a45'], path: '#b8925f',
    sky: ['#55709a', '#d9b48f', '#f6cf98'], sun: [-0.6, 0.22, -1], sunColor: '#ffc887', fog: [10, 135],
    conifers: 90, broadleaf: 620, bushes: 240, flowers: 700,
    leaf: ['#d9822b', '#c4561f', '#e8b23a', '#a8401c', '#e0a040', '#7e8a3a'], bush: ['#a8642a', '#8a6a2e', '#c27a30'],
    bloom: ['#d9822b', '#c4561f', '#e8b23a', '#8e3a18'],
    peaks: 'hills', motes: '#ffb45e', fall: true,
  },
  winter: {
    amp: 7, ground: ['#d9e1ea', '#f7f9fb'], path: '#c9d2dc',
    sky: ['#5f7aa6', '#c4d0e2', '#eef2f7'], sun: [0.55, 0.2, -1], sunColor: '#fff3e0', fog: [10, 170],
    conifers: 560, broadleaf: 60, bushes: 140, flowers: 0,
    leaf: ['#1f3b33', '#27463b', '#30503f'], bush: ['#e9eef4', '#dbe3ec'], bloom: ['#ffffff'],
    peaks: 'alpine', motes: '#ffffff', fall: true, open: 7,
  },
  garden: {
    amp: 2.6, ground: ['#5c8e53', '#8db06c'], path: '#e6d8bb',
    sky: ['#6c8fc8', '#dcc6da', '#fbe8da'], sun: [0.5, 0.55, 0.2], sunColor: '#fff0e0', fog: [24, 175],
    conifers: 26, broadleaf: 170, bushes: 440, flowers: 1400,
    leaf: ['#eda9c0', '#f6d9e2', '#ffffff', '#7fae6c', '#93bb78'], bush: ['#4f8a4c', '#63994f', '#3f7a45'],
    bloom: ['#f2b4c6', '#ffd9a0', '#ffffff', '#c9b6f2', '#f49aa8', '#ff8fa3'],
    peaks: 'hills', motes: '#ffd6e2',
  },
};

function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (x: number, a: number, b: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const pathX = (z: number) => 9 * Math.sin(W * z) + 4 * Math.sin(2 * W * z + 1.3);

function makeHeight(cfg: Cfg) {
  return (x: number, z: number) => {
    const d = x - pathX(z);
    const ad = Math.abs(d);
    const n = 0.5 * Math.sin(x * 0.09 + 1.7) * Math.cos(3 * W * z + x * 0.03)
      + 0.25 * Math.sin(x * 0.21 + 0.4) * Math.sin(5 * W * z + 2.1)
      + 0.5 * Math.sin(x * 0.05) * Math.cos(2 * W * z);
    const side = smooth(ad, 2.5, 26);
    let h = cfg.amp * (n * 0.6 + 0.55) * side + side * side * cfg.amp * 0.6 * (ad / 40);
    h += 0.6 * Math.sin(2 * W * z);
    if (cfg.water) {
      const sea = smooth(d, 3.5, 15);
      h = h * (1 - sea) - 6 * sea;
    }
    return h;
  };
}

/** Merge simple geometries into one faceted, vertex-coloured geometry. */
function merge(parts: { g: THREE.BufferGeometry; color: string }[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const { g, color } of parts) {
    const n = g.index ? g.toNonIndexed() : g;
    n.computeVertexNormals();
    const c = new THREE.Color(color);
    const p = n.attributes.position.array as ArrayLike<number>, nn = n.attributes.normal.array as ArrayLike<number>;
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(nn[i]); }
    for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

function jitter(g: THREE.BufferGeometry, amount: number, r: () => number) {
  // move shared vertices together so the surface stays closed
  const p = g.attributes.position; const seen = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = seen.get(k);
    if (!o) { o = [(r() - 0.5) * amount, (r() - 0.5) * amount, (r() - 0.5) * amount]; seen.set(k, o); }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  return g;
}

export function createWorld(container: HTMLElement, world: World, opts: Opts = {}): WorldHandle {
  const cfg = CFG[world.id];
  if (!cfg) throw new Error('No 3D world for ' + world.id);
  const height = makeHeight(cfg);
  const r = rng(world.id.length * 7919 + 13);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  let dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(dpr);
  const canvas = renderer.domElement;
  canvas.style.cssText = 'width:100%;height:100%;display:block';
  container.appendChild(canvas);

  const scene = new THREE.Scene();
  const fogColor = new THREE.Color(cfg.sky[2]);
  scene.fog = new THREE.Fog(fogColor, cfg.fog[0], cfg.fog[1]);
  scene.background = fogColor;
  const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 1400);

  // ---- light ----
  const sunDir = new THREE.Vector3(...cfg.sun).normalize();
  const sun = new THREE.DirectionalLight(cfg.sunColor, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 320;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(new THREE.Color(cfg.sky[1]), new THREE.Color(cfg.ground[0]), 1.9));

  // ---- sky ----
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Color(cfg.sky[0]) }, mid: { value: new THREE.Color(cfg.sky[1]) }, bot: { value: fogColor },
        sunDir: { value: sunDir }, sunCol: { value: new THREE.Color(cfg.sunColor) },
      },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 sunCol;
        void main(){
          vec3 d = normalize(vP);
          float t = clamp(d.y * 1.5, 0.0, 1.0);
          vec3 c = mix(bot, mid, smoothstep(0.0, 0.3, t));
          c = mix(c, top, smoothstep(0.3, 1.0, t));
          float s = max(dot(d, sunDir), 0.0);
          c += sunCol * (pow(s, 900.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.18);
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.frustumCulled = false;
  scene.add(sky);

  // ---- terrain (one geometry, repeated) ----
  const WIDTH = 230, SX = 120, SZ = 84;
  const tg = new THREE.PlaneGeometry(WIDTH, LOOP, SX, SZ);
  tg.rotateX(-Math.PI / 2);
  {
    const p = tg.attributes.position, nrm = tg.attributes.normal;
    const col = new Float32Array(p.count * 3);
    const lo = new THREE.Color(cfg.ground[0]), hi = new THREE.Color(cfg.ground[1]), pc = new THREE.Color(cfg.path), sand = new THREE.Color('#d6c69c');
    const c = new THREE.Color(), v = new THREE.Vector3();
    const e = 0.6;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), h = height(x, z);
      p.setY(i, h);
      v.set(height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)).normalize();
      nrm.setXYZ(i, v.x, v.y, v.z);
      const patch = 0.5 + 0.5 * Math.sin(x * 0.7 + 3 * Math.sin(9 * W * z)) * Math.sin(17 * W * z + x * 0.13);
      c.copy(lo).lerp(hi, Math.min(1, Math.max(0, h / (cfg.amp * 1.6) + patch * 0.45)));
      const ad = Math.abs(x - pathX(z));
      const edge = 1.5 + 0.35 * Math.sin(23 * W * z + x);
      c.lerp(pc, 1 - smooth(ad, edge * 0.7, edge * 1.5));
      if (cfg.water) c.lerp(sand, smooth(-h, 1.5, 3.5));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    tg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  for (let t = 0; t < TILES; t++) {
    const m = new THREE.Mesh(tg, terrainMat);
    m.position.z = -t * LOOP;
    m.receiveShadow = true;
    scene.add(m);
  }

  // ---- plants ----
  type Item = { x: number; y: number; z: number; s: number; w: number; h: number; rot: number };
  const scatter = (count: number, clear: number, bias: number, sMin: number, sMax: number, maxD = 98): Item[] => {
    const out: Item[] = [];
    for (let tries = 0; out.length < count && tries < count * 6; tries++) {
      const z = (r() - 0.5) * LOOP;
      const d = clear + Math.pow(r(), bias) * (maxD - clear);
      const x = pathX(z) + (r() < 0.5 ? -d : d);
      if (Math.abs(x) > 108) continue;
      const y = height(x, z);
      if (cfg.water && y < -0.8) continue;
      out.push({ x, y, z, s: sMin + r() * (sMax - sMin), w: 0.85 + r() * 0.3, h: 0.85 + r() * 0.4, rot: r() * TAU });
    }
    return out;
  };
  const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
  const up = new THREE.Vector3(0, 1, 0);
  const addInstanced = (geo: THREE.BufferGeometry, items: Item[], colors: string[], shadow: boolean, boost = 1) => {
    if (!items.length) return;
    const mesh = new THREE.InstancedMesh(geo, plantMat, items.length * TILES);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color();
    let i = 0;
    for (const it of items) {
      const colour = colors[Math.floor(r() * colors.length)], shade = (0.82 + r() * 0.36) * boost;
      q.setFromAxisAngle(up, it.rot);
      s.set(it.s * it.w, it.s * it.h, it.s * it.w);
      for (let t = 0; t < TILES; t++) {
        p.set(it.x, it.y - 0.05, it.z - t * LOOP);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.set(colour).multiplyScalar(shade));
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = shadow;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
  };

  const trunk = '#b08a66';
  const coniferGeo = merge([
    { g: new THREE.CylinderGeometry(0.1, 0.16, 1.2, 5).translate(0, 0.6, 0), color: trunk },
    { g: new THREE.ConeGeometry(1.15, 2.2, 7).translate(0, 2.0, 0), color: '#ffffff' },
    { g: new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.1, 0), color: '#f2f2f2' },
    { g: new THREE.ConeGeometry(0.6, 1.8, 7).translate(0, 4.2, 0), color: '#e6e6e6' },
  ]);
  const blob = (rad: number, x: number, y: number, z: number) => jitter(new THREE.IcosahedronGeometry(rad, 1), rad * 0.22, r).translate(x, y, z);
  const broadleafGeo = merge([
    { g: new THREE.CylinderGeometry(0.12, 0.2, 2.0, 5).translate(0, 1.0, 0), color: trunk },
    { g: blob(1.25, 0, 2.9, 0), color: '#ffffff' },
    { g: blob(0.9, 0.85, 2.4, 0.2), color: '#ececec' },
    { g: blob(0.8, -0.7, 2.5, -0.4), color: '#f4f4f4' },
  ]);
  const bushGeo = merge([{ g: jitter(new THREE.IcosahedronGeometry(1, 1), 0.2, r).scale(1, 0.72, 1).translate(0, 0.45, 0), color: '#ffffff' }]);
  const flowerGeo = merge([{ g: new THREE.OctahedronGeometry(0.055, 0).scale(1, 0.7, 1).translate(0, 0.12, 0), color: '#ffffff' }]);

  addInstanced(coniferGeo, scatter(cfg.conifers, cfg.open ?? 4.5, cfg.open ? 1 : 1.5, 1.2, 2.6), cfg.conifers > 100 ? cfg.leaf : cfg.bush, true);
  addInstanced(broadleafGeo, scatter(cfg.broadleaf, cfg.open ?? 5, 1.4, 1.1, 2.3), cfg.leaf, true);
  addInstanced(bushGeo, scatter(cfg.bushes, 2.6, 2.2, 0.5, 1.5), cfg.bush, true);
  addInstanced(flowerGeo, scatter(cfg.flowers * 3, 2.4, 2.6, 0.8, 1.5, 34), cfg.bloom, false, 1.6);

  // ---- water ----
  let waterTex: THREE.DataTexture | null = null;
  if (cfg.water) {
    const N = 128, data = new Uint8Array(N * N * 4);
    const waves = [[3, 1, 0.2], [1, 4, 1.7], [5, 2, 3.1], [2, 7, 4.4], [8, 3, 0.9]];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = i / N, v = j / N; let dx = 0, dy = 0;
      for (const [a, b, ph] of waves) { const cs = Math.cos(TAU * (a * u + b * v) + ph) / Math.hypot(a, b); dx += a * cs; dy += b * cs; }
      const n = new THREE.Vector3(-dx * 0.5, -dy * 0.5, 1).normalize();
      const k = (j * N + i) * 4;
      data[k] = (n.x * 0.5 + 0.5) * 255; data[k + 1] = (n.y * 0.5 + 0.5) * 255; data[k + 2] = (n.z * 0.5 + 0.5) * 255; data[k + 3] = 255;
    }
    waterTex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(70, 70);
    waterTex.magFilter = THREE.LinearFilter; waterTex.minFilter = THREE.LinearMipmapLinearFilter; waterTex.generateMipmaps = true;
    waterTex.needsUpdate = true;
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#2c6d8e', roughness: 0.16, metalness: 0.05, normalMap: waterTex, normalScale: new THREE.Vector2(0.45, 0.45), transparent: true, opacity: 0.93 })
    );
    water.position.set(560, -3.6, -LOOP * 1.5);
    scene.add(water);
  }

  // ---- distant ranges (follow the camera) ----
  const backdrop = new THREE.Group();
  scene.add(backdrop);
  const range = (R: number, maxH: number, rock: string, haze: number, snow: boolean, seed: number) => {
    const N = 220, rr = rng(seed), ph = [rr() * TAU, rr() * TAU, rr() * TAU, rr() * TAU];
    const ridge = (a: number) => 0.5 * (1 - Math.abs(Math.sin(3 * a + ph[0]))) + 0.3 * (1 - Math.abs(Math.sin(7 * a + ph[1]))) + 0.2 * (1 - Math.abs(Math.sin(13 * a + ph[2]))) + 0.06 * Math.sin(31 * a + ph[3]);
    const pos: number[] = [], col: number[] = [];
    const base = new THREE.Color(rock).lerp(fogColor, haze), foot = new THREE.Color(cfg.ground[0]).lerp(fogColor, Math.min(1, haze + 0.15)), white = new THREE.Color('#ffffff').lerp(fogColor, haze * 0.5);
    const ring = (a: number) => {
      const h = maxH * (0.25 + 0.75 * ridge(a)), cs = Math.cos(a), sn = Math.sin(a);
      const top = snow && h > maxH * 0.62 ? white : base;
      return [
        { p: [(R - 60) * cs, -12, (R - 60) * sn], c: foot },
        { p: [(R - 20) * cs, h * 0.45, (R - 20) * sn], c: base },
        { p: [R * cs, h, R * sn], c: top },
      ];
    };
    for (let i = 0; i < N; i++) {
      const A = ring((i / N) * TAU), B = ring(((i + 1) / N) * TAU);
      for (let k = 0; k < 2; k++) {
        for (const v of [A[k], B[k], B[k + 1], A[k], B[k + 1], A[k + 1]]) { pos.push(...v.p); col.push(v.c.r, v.c.g, v.c.b); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, fog: false, side: THREE.DoubleSide }));
    m.frustumCulled = false;
    backdrop.add(m);
  };
  if (cfg.peaks === 'alpine') { range(900, 430, '#6d6a8c', 0.55, true, 5); range(620, 230, '#55607a', 0.42, true, 9); range(420, 55, '#3f5f48', 0.5, false, 3); }
  if (cfg.peaks === 'hills') { range(520, 60, cfg.ground[0], 0.72, false, 4); }

  // ---- drifting motes (pollen / petals) ----
  let motes: THREE.Points | null = null; let moteSeed: Float32Array | null = null;
  if (cfg.motes && !opts.still) {
    const n = cfg.fall ? 700 : 260; moteSeed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { moteSeed[i * 4] = (r() - 0.5) * 26; moteSeed[i * 4 + 1] = 0.4 + r() * 5.5; moteSeed[i * 4 + 2] = r() * 34; moteSeed[i * 4 + 3] = r() * TAU; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const S = 32, dot = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const d = Math.hypot(i - S / 2 + 0.5, j - S / 2 + 0.5) / (S / 2);
      const k = (j * S + i) * 4; dot[k] = dot[k + 1] = dot[k + 2] = 255; dot[k + 3] = Math.max(0, Math.min(255, (1 - d) * 2 * 255));
    }
    const dotTex = new THREE.DataTexture(dot, S, S, THREE.RGBAFormat); dotTex.needsUpdate = true;
    motes = new THREE.Points(g, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.02, color: cfg.motes, size: cfg.fall ? 0.11 : 0.07, transparent: true, opacity: cfg.fall ? 0.95 : 0.75, depthWrite: false, blending: cfg.fall ? THREE.NormalBlending : THREE.AdditiveBlending, sizeAttenuation: true }));
    motes.frustumCulled = false;
    scene.add(motes);
  }

  // ---- frame loop ----
  let raf = 0, disposed = false, visible = true, readySent = false;
  let camZ = -20, last = performance.now(), time = 0;
  let frames = 0, acc = 0, level = 0;
  const look = new THREE.Vector3();

  const place = () => {
    const x = pathX(camZ);
    camera.position.set(x, height(x, camZ) + 1.75, camZ);
    const lz = camZ - 16, lx = pathX(lz);
    look.set(lx * 0.8 + x * 0.2, height(lx, lz) + 1.9, lz);
    camera.lookAt(look);
    sky.position.copy(camera.position);
    backdrop.position.set(camera.position.x, 0, camera.position.z);
    const tz = Math.round(camZ / 8) * 8 - 34;
    sun.target.position.set(0, 0, tz);
    sun.position.set(0, 0, tz).addScaledVector(sunDir, 150);
    if (motes && moteSeed) {
      const p = motes.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const wz = -moteSeed[i * 4 + 2], rel = (((camZ - wz) % 34) + 34) % 34;
        p.setXYZ(i, x + moteSeed[i * 4] + Math.sin(time * 0.3 + moteSeed[i * 4 + 3]) * 0.6, cfg.fall ? 0.1 + ((((moteSeed[i * 4 + 1] - time * (0.45 + moteSeed[i * 4 + 3] * 0.06)) % 6) + 6) % 6) : moteSeed[i * 4 + 1] + Math.sin(time * 0.5 + moteSeed[i * 4 + 3] * 2) * 0.3, camZ - rel);
      }
      p.needsUpdate = true;
    }
  };
  const render = () => {
    place();
    renderer.render(scene, camera);
    if (!readySent) { readySent = true; opts.onReady?.(); }
  };
  const fail = () => { if (disposed) return; dispose(); opts.onFail?.(); };

  const tick = (now: number) => {
    if (disposed) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!visible) return;
    time += dt;
    camZ -= 1.15 * dt;
    if (camZ < -LOOP) camZ += LOOP;
    if (waterTex) { waterTex.offset.x = time * 0.012; waterTex.offset.y = time * 0.02; }
    render();
    // adaptive quality
    frames++;
    if (frames > 25) acc += dt;
    if (frames === 85) {
      const avg = acc / 60;
      if (avg > 0.05 && level >= 1) return fail();
      if (avg > 0.027) {
        level++;
        dpr = 1; renderer.setPixelRatio(1); resize();
        renderer.shadowMap.enabled = false; sun.castShadow = false;
        scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
        frames = 0; acc = 0;
      }
    }
  };

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 68 : 58;
    camera.updateProjectionMatrix();
    if (opts.still) render();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  const io = new IntersectionObserver(es => { visible = es[0]?.isIntersecting ?? true; last = performance.now(); });
  io.observe(container);
  canvas.addEventListener('webglcontextlost', fail);

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect(); io.disconnect();
    canvas.removeEventListener('webglcontextlost', fail);
    scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach(x => x.dispose());
    });
    waterTex?.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch {}
    canvas.remove();
  }

  resize();
  if (opts.still) render();
  else raf = requestAnimationFrame(tick);
  return { dispose };
}
