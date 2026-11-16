// app/settings.tsx — your walking world and all settings, on their own page.
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import HomeSettings from '../components/spark/HomeSettings';
import WorldPicker from '../components/spark/WorldPicker';
import { ink, space } from '../lib/spark/tokens';
import { Card, type, useSparkFonts } from '../components/spark/ui';

export default function Settings() {
  useSparkFonts();
  const router = useRouter();
  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} accessibilityRole="button" accessibilityLabel="Back"
          style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={ink.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.label, { flex: 1, textAlign: 'center' }]}>Settings</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 60, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 10 }}>
          <Text accessibilityRole="header" style={type.title}>Your walking world</Text>
          <WorldPicker />
        </View>
        <HomeSettings />
      </ScrollView>
    </View>
  );
}