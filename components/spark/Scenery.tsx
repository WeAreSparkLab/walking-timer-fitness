// components/spark/Scenery.tsx — native fallback (gradient sky + layered hills).
// The web build uses Scenery.web.tsx.
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { World } from '../../lib/spark/worlds';

type Props = { world: World; still?: boolean; fadeTo?: string; style?: any; label?: string; focus?: 'ground' | 'horizon' };

export default function Scenery({ world, fadeTo, label }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} accessible={!!label} accessibilityLabel={label} pointerEvents="none">
      <LinearGradient colors={world.sky} style={StyleSheet.absoluteFill} />
      {world.layers.map((c, i) => (
        <View key={i} style={{ position: 'absolute', left: -40 + i * 13, right: -60 + i * 9, bottom: -120 + i * -18, height: 220 - i * 22, borderTopLeftRadius: 400, borderTopRightRadius: 300, backgroundColor: c }} />
      ))}
      {fadeTo ? <LinearGradient colors={['transparent', fadeTo]} locations={[0.5, 1]} style={StyleSheet.absoluteFill} /> : null}
    </View>
  );
}
