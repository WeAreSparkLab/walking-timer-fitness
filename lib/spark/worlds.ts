// lib/spark/worlds.ts — the four walking worlds (virtual scenery, not locations)
import type { WorldId } from './prefs';

export type World = {
  id: WorldId;
  name: string;
  line: string;
  sky: [string, string, string];   // top, middle, horizon
  sun: { x: number; y: number; r: number; color: string; glow: string };
  haze: string;                    // atmospheric colour layers fade towards
  layers: string[];                // far → near ridge colours
  accent: string;
};

export const WORLDS: World[] = [
  {
    id: 'woodland', name: 'Woodland Trail', line: 'Sunlight through tall trees',
    sky: ['#2B3B2E', '#6E7F56', '#E9C88A'],
    sun: { x: 0.72, y: 0.34, r: 26, color: '#FFE2A8', glow: 'rgba(255,214,140,0.55)' },
    haze: '#C9B98A', layers: ['#7B8A62', '#4F6644', '#33492F', '#1F3020', '#121D14'], accent: '#F2C27A',
  },
  {
    id: 'coastal', name: 'Coastal Path', line: 'Open skies and a long horizon',
    sky: ['#2C4B6E', '#7FA6C4', '#F4D9B8'],
    sun: { x: 0.28, y: 0.4, r: 22, color: '#FFF1D6', glow: 'rgba(255,236,200,0.5)' },
    haze: '#BFD3DE', layers: ['#5D7F95', '#3E6178', '#6B7A5A', '#45563B', '#25321F'], accent: '#9FD0E8',
  },
  {
    id: 'mountain', name: 'Mountain Escape', line: 'Distant peaks in morning light',
    sky: ['#30385E', '#B88E9C', '#F6C99A'],
    sun: { x: 0.6, y: 0.46, r: 30, color: '#FFE6C2', glow: 'rgba(255,200,150,0.5)' },
    haze: '#D6B7B0', layers: ['#9C8FA6', '#6F6E8A', '#55705A', '#3A5640', '#1F3324'], accent: '#F4B89A',
  },
  {
    id: 'garden', name: 'Garden Walk', line: 'Soft colour and quiet paths',
    sky: ['#4A4A6E', '#C9A6B8', '#F7E1CF'],
    sun: { x: 0.8, y: 0.3, r: 20, color: '#FFF3E4', glow: 'rgba(255,230,215,0.5)' },
    haze: '#E2CBC8', layers: ['#9FAE96', '#7C9579', '#5C7A5E', '#3F5C45', '#26392B'], accent: '#F2B4C6',
  },
];

export const SEASONAL_WORLDS: World[] = [
  {
    id: 'autumn', name: 'Autumn Lane', line: 'Golden leaves and low sun',
    sky: ['#4B5878', '#C9A27E', '#F3C98D'],
    sun: { x: 0.3, y: 0.42, r: 24, color: '#FFE0AE', glow: 'rgba(255,190,120,0.55)' },
    haze: '#D9B48A', layers: ['#A8875E', '#B5652F', '#8E4A25', '#5E3A22', '#2E2116'], accent: '#E9925A',
  },
  {
    id: 'winter', name: 'Winter Hills', line: 'Fresh snow and quiet air',
    sky: ['#53688F', '#B9C6DA', '#EEF1F5'],
    sun: { x: 0.68, y: 0.44, r: 20, color: '#FFF6E8', glow: 'rgba(255,245,230,0.5)' },
    haze: '#DCE3EC', layers: ['#B4C0D2', '#94A6BC', '#E6ECF3', '#C9D4E1', '#F4F7FA'], accent: '#A9C8F0',
  },
];
WORLDS.push(...SEASONAL_WORLDS);

export const SIMPLE_WORLD: World = {
  id: 'simple', name: 'Simple', line: 'Calm colour, no scenery',
  sky: ['#0D1310', '#141C17', '#1C2620'], sun: { x: 0.5, y: 0.5, r: 0, color: 'transparent', glow: 'transparent' },
  haze: '#1C2620', layers: [], accent: '#F2A65A',
};

export function getWorld(id: WorldId): World {
  return WORLDS.find(w => w.id === id) ?? SIMPLE_WORLD;
}
