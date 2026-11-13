// lib/spark/tokens.ts — Spark Walk visual identity
import type { Pace } from '../storage';

export const ink = {
  bg: '#0D1310',        // deep evergreen night
  bg2: '#141C17',
  card: 'rgba(246,241,231,0.06)',
  cardSolid: '#18211B',
  line: 'rgba(246,241,231,0.12)',
  text: '#F6F1E7',      // warm ivory
  sub: '#C2BFB3',       // 9.6:1 on bg
  faint: '#8E8C83',
  ember: '#F2A65A',     // warm sunlight — primary action
  emberInk: '#1B1208',
  moss: '#9CC5A1',
  danger: '#FF8A7A',
  focus: '#FFD58A',
};

export const fonts = {
  display: 'Fraunces, Georgia, "Times New Roman", serif',
  body: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export const space = { xs: 6, sm: 10, md: 16, lg: 24, xl: 36, xxl: 56 };
export const round = { sm: 12, md: 18, lg: 26, pill: 999 };

/** Phase colours: always paired with an icon + word, never colour alone. */
export const phaseTone: Record<Pace, { dark: string; light: string; onDark: string; onLight: string }> = {
  WARMUP:   { dark: '#F5B860', light: '#8A4B00', onDark: '#1A1206', onLight: '#FFFFFF' },
  FAST:     { dark: '#FF8C6B', light: '#A3300F', onDark: '#1E0B05', onLight: '#FFFFFF' },
  SLOW:     { dark: '#8FD3B0', light: '#1E6B47', onDark: '#06180F', onLight: '#FFFFFF' },
  COOLDOWN: { dark: '#A9BCFF', light: '#2F4BA8', onDark: '#0A1030', onLight: '#FFFFFF' },
};
