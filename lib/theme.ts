// lib/theme.ts — legacy palette, now mapped onto the Spark Walk identity
// (lib/spark/tokens.ts) so older screens match the redesign.
export const colors = {
  bg: '#0D1310',                 // deep evergreen night
  card: 'rgba(246,241,231,0.06)',
  line: 'rgba(246,241,231,0.12)',
  text: '#F6F1E7',               // warm ivory
  sub: '#C2BFB3',
  accent: '#B4561C',             // deep ember (white text 4.9:1)
  accent2: '#9CC5A1',            // moss
  success: '#8FD3B0',
  danger: '#FF8A7A',
};

export const radius = { lg: 26, md: 18, sm: 12 };
export const pad = { xl: 28, lg: 22, md: 16, sm: 12 };

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/** Pace palette — matches phaseTone in lib/spark/tokens.ts */
export const paceColors: Record<'WARMUP'|'FAST'|'SLOW'|'COOLDOWN', { fg: string; border: string; bg: string }> = {
  WARMUP:   { fg: '#F5B860', border: '#F5B860', bg: 'rgba(245,184,96,0.14)' },
  FAST:     { fg: '#FF8C6B', border: '#FF8C6B', bg: 'rgba(255,140,107,0.14)' },
  SLOW:     { fg: '#8FD3B0', border: '#8FD3B0', bg: 'rgba(143,211,176,0.14)' },
  COOLDOWN: { fg: '#A9BCFF', border: '#A9BCFF', bg: 'rgba(169,188,255,0.15)' },
};