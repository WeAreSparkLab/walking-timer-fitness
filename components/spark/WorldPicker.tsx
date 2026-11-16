// components/spark/WorldPicker.tsx — choose your walking world (two columns, small cards).
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WORLDS, SIMPLE_WORLD } from '../../lib/spark/worlds';
import { usePrefs } from '../../lib/spark/prefs';
import { ink, round } from '../../lib/spark/tokens';
import { type } from './ui';
import Scenery from './Scenery';

export default function WorldPicker() {
  const [prefs, setPrefs] = usePrefs();
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 12 }}>
        {[...WORLDS, SIMPLE_WORLD].map(w => {
          const on = prefs.world === w.id;
          return (
            <Pressable key={w.id} onPress={() => setPrefs({ world: w.id })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${w.name}. ${w.line}`}
              style={{ width: '48%', borderRadius: round.md, overflow: 'hidden', borderWidth: 2, borderColor: on ? ink.ember : ink.line }}>
              <View style={{ height: 80 }}><Scenery world={w} still /></View>
              <View style={{ padding: 10, backgroundColor: ink.cardSolid, minHeight: 64 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {on ? <Ionicons name="checkmark-circle" size={16} color={ink.ember} /> : null}
                  <Text style={[type.label, { fontSize: 14, flexShrink: 1 }]} numberOfLines={2}>{w.name}</Text>
                </View>
                <Text style={[type.small, { fontSize: 13 }]} numberOfLines={2}>{w.line}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={[type.small, { color: ink.faint }]}>Worlds are scenery for the app, not maps of where you are.</Text>
    </View>
  );
}