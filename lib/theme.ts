// lib/theme.ts
export const colors = {
  bg: '#0e1223',                 // deep navy
  card: 'rgba(22, 28, 54, 0.85)',
  line: 'rgba(106, 13, 173, 0.35)', // purple outline/glow
  text: '#ffffff',
  sub: '#9aa0b4',
  accent: '#8a2be2',             // purple (generic primary)
  accent2: '#00eaff',            // cyan (generic secondary)
  success: '#00d98b',
  danger: '#ff4d6d',
};

export const radius = { lg: 20, md: 14, sm: 10 };
export const pad = { xl: 28, lg: 22, md: 16, sm: 12 };

export const shadow = {
  card: {
    shadowColor: '#6a0dad',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
};

/**
 * Pace palette — consistent across editor + timer
 * Feel free to swap hexes; bg uses a soft translucent tint.
 */
export const paceColors: Record<'WARMUP'|'FAST'|'SLOW'|'COOLDOWN', {
  fg: string;      // text/icon color
  border: string;  // stroke / outline
  bg: string;      // chip / badge background
}> = {
  WARMUP:   { fg: '#00d98b', border: '#00d98b', bg: 'rgba(0,217,139,0.14)' },  // green
  FAST:     { fg: '#ff6bd6', border: '#ff6bd6', bg: 'rgba(255,107,214,0.14)' },// magenta
  SLOW:     { fg: '#00eaff', border: '#00eaff', bg: 'rgba(0,234,255,0.14)' },  // cyan
  COOLDOWN: { fg: '#66a6ff', border: '#66a6ff', bg: 'rgba(102,166,255,0.15)' } // blue
};
