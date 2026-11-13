// components/spark/ui.tsx — shared Spark Walk primitives
import React, { useEffect } from 'react';
import { Pressable, Text, View, Platform, StyleSheet, ViewStyle, TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ink, fonts, round, space, phaseTone } from '../../lib/spark/tokens';
import { Segment, totalSeconds, PHASE_COPY } from '../../lib/walk/schedule';

let fontsInjected = false;
/** Loads Fraunces + Inter on web once. Falls back to system fonts if offline. */
export function useSparkFonts() {
  useEffect(() => {
    if (Platform.OS !== 'web' || fontsInjected || typeof document === 'undefined') return;
    fontsInjected = true;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Inter:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.textContent = `:focus-visible{outline:3px solid ${ink.focus}!important;outline-offset:3px;border-radius:14px}`;
    document.head.appendChild(s);
  }, []);
}

const F = (family: string, weight: TextStyle['fontWeight'] = '400'): TextStyle =>
  Platform.OS === 'web' ? { fontFamily: family, fontWeight: weight } : { fontWeight: weight };

export const type = StyleSheet.create({
  display: { ...F(fonts.display, '400'), color: ink.text, fontSize: 34, lineHeight: 40, letterSpacing: -0.4 },
  title: { ...F(fonts.display, '600'), color: ink.text, fontSize: 22, lineHeight: 28 },
  body: { ...F(fonts.body), color: ink.sub, fontSize: 16, lineHeight: 23 },
  label: { ...F(fonts.body, '600'), color: ink.text, fontSize: 16 },
  small: { ...F(fonts.body, '500'), color: ink.sub, fontSize: 14, lineHeight: 20 },
  eyebrow: { ...F(fonts.body, '600'), color: ink.faint, fontSize: 13, letterSpacing: 1.2, textTransform: 'uppercase' },
  num: { ...F(fonts.body, '600'), fontVariant: ['tabular-nums'] },
});

type BtnProps = {
  label: string; onPress: () => void; icon?: any; kind?: 'primary' | 'secondary' | 'quiet' | 'danger';
  style?: ViewStyle; big?: boolean; a11yHint?: string; disabled?: boolean; tone?: { bg: string; fg: string };
};
export function Button({ label, onPress, icon, kind = 'primary', style, big, a11yHint, disabled, tone }: BtnProps) {
  const bg = tone?.bg ?? (kind === 'primary' ? ink.ember : kind === 'secondary' ? 'rgba(246,241,231,0.1)' : 'transparent');
  const fg = tone?.fg ?? (kind === 'primary' ? ink.emberInk : kind === 'danger' ? ink.danger : ink.text);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={a11yHint}
      style={({ pressed }) => [
        {
          minHeight: big ? 68 : 54, paddingHorizontal: 22, borderRadius: round.md, backgroundColor: bg,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
          borderWidth: kind === 'secondary' || kind === 'danger' ? 1 : 0, borderColor: kind === 'danger' ? 'rgba(255,138,122,0.5)' : ink.line,
          opacity: disabled ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={big ? 26 : 20} color={fg} /> : null}
      <Text style={[type.label, { color: fg, fontSize: big ? 19 : 16 }]}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, style, onPress, label }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void; label?: string }) {
  const base: ViewStyle = { backgroundColor: ink.card, borderRadius: round.lg, borderWidth: 1, borderColor: ink.line, padding: space.md };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => [base, { opacity: pressed ? 0.85 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

export function PhaseIcon({ pace, size = 20, color }: { pace: Segment['pace']; size?: number; color?: string }) {
  return <Ionicons name={PHASE_COPY[pace].icon as any} size={size} color={color ?? phaseTone[pace].dark} />;
}

/**
 * Timeline of the whole walk. Width = duration. Height also encodes pace
 * (brisk is tallest) so it reads without colour.
 */
export function Timeline({ segments, progress, light, height = 34 }: { segments: Segment[]; progress?: number; light?: boolean; height?: number }) {
  const total = totalSeconds(segments) || 1;
  const hFor = { WARMUP: 0.55, FAST: 1, SLOW: 0.5, COOLDOWN: 0.4 } as const;
  return (
    <View accessible accessibilityLabel={`Walk timeline with ${segments.length} parts`} style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {segments.map((s, i) => (
        <View key={i} style={{ flex: s.seconds / total, height: height * hFor[s.pace], borderRadius: 4, backgroundColor: light ? phaseTone[s.pace].light : phaseTone[s.pace].dark, opacity: 0.9 }} />
      ))}
      {progress != null ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: `${Math.min(100, progress * 100)}%` as any, top: -4, bottom: -4, width: 3, marginLeft: -1.5, borderRadius: 2, backgroundColor: light ? '#111' : '#FFF' }} />
      ) : null}
    </View>
  );
}

type TogglePalette = { text: string; sub: string; trackOff: string; knobOff: string; trackOn: string; knobOn: string };
const DARK_TOGGLE: TogglePalette = { text: ink.text, sub: ink.sub, trackOff: 'rgba(246,241,231,0.18)', knobOff: ink.text, trackOn: ink.ember, knobOn: ink.emberInk };
export const LIGHT_TOGGLE: TogglePalette = { text: '#121212', sub: '#3B3A36', trackOff: '#8C877C', knobOff: '#FFFFFF', trackOn: '#8A4B00', knobOn: '#FFFFFF' };

export function Toggle({ label, value, onChange, note, palette = DARK_TOGGLE }: { label: string; value: boolean; onChange: (v: boolean) => void; note?: string; palette?: TogglePalette }) {
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}>
        <Text style={[type.label, { color: palette.text }]}>{label}</Text>
        {note ? <Text style={[type.small, { marginTop: 2, color: palette.sub }]}>{note}</Text> : null}
      </View>
      <View style={{ width: 52, height: 32, borderRadius: 16, padding: 3, backgroundColor: value ? palette.trackOn : palette.trackOff, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: value ? palette.knobOn : palette.knobOff }} />
      </View>
      <Text style={[type.small, { width: 28, color: palette.sub }]}>{value ? 'On' : 'Off'}</Text>
    </Pressable>
  );
}
