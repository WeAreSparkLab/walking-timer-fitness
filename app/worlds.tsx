// app/worlds.tsx — browse and choose a walking world (no sign-in needed)
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Scenery from '../components/spark/Scenery';
import { WORLDS } from '../lib/spark/worlds';
import { usePrefs, prefersReducedMotion } from '../lib/spark/prefs';
import { ink, round, space } from '../lib/spark/tokens';
import { Button, Toggle, type, useSparkFonts } from '../components/spark/ui';

export default function Worlds() {
  useSparkFonts();
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const still = prefs.lowPower || prefersReducedMotion();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: ink.bg }} contentContainerStyle={{ padding: space.md, paddingTop: 48, gap: space.lg, maxWidth: 760, width: '100%', alignSelf: 'center' }}>
      <View style={{ gap: 6 }}>
        <Text accessibilityRole="header" style={type.display}>Walking worlds</Text>
        <Text style={type.body}>Choose the scenery Spark Walk shows around your walks. These are imagined places, not maps of where you are.</Text>
      </View>
      {WORLDS.map(w => {
        const on = prefs.world === w.id;
        return (
          <Pressable key={w.id} onPress={() => setPrefs({ world: w.id })} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${w.name}. ${w.line}`}
            style={{ borderRadius: round.lg, overflow: 'hidden', borderWidth: 2, borderColor: on ? ink.ember : ink.line }}>
            <View style={{ height: 260 }}><Scenery world={w} still={still} /></View>
            <View style={{ padding: space.md, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: ink.cardSolid }}>
              <View style={{ flex: 1 }}>
                <Text style={type.title}>{w.name}</Text>
                <Text style={type.small}>{w.line}</Text>
              </View>
              {on ? <Ionicons name="checkmark-circle" size={28} color={ink.ember} /> : <Ionicons name="ellipse-outline" size={28} color={ink.faint} />}
            </View>
          </Pressable>
        );
      })}
      <Toggle label="Simple mode (no scenery)" value={prefs.world === 'simple'} onChange={v => setPrefs({ world: v ? 'simple' : 'woodland' })} />
      <Toggle label="Low-power mode" value={prefs.lowPower} onChange={v => setPrefs({ lowPower: v })} note="Turns off scenery and animation to save battery." />
      <Button label="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
    </ScrollView>
  );
}
