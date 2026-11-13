// app/settings.tsx — all app settings in one place.
// These preferences are saved on this device (lib/spark/prefs.ts).
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { usePrefs } from '../lib/spark/prefs';
import { getWorld } from '../lib/spark/worlds';
import { capabilities, chime, speak, unlockAudio } from '../lib/walk/cues';
import { ink, round, space } from '../lib/spark/tokens';
import { Button, Card, Toggle, type, useSparkFonts } from '../components/spark/ui';

export default function Settings() {
  useSparkFonts();
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const caps = useMemo(capabilities, []);
  const [confirmOut, setConfirmOut] = useState(false);
  const vol = Math.round(prefs.volume * 100);

  const testSound = () => {
    unlockAudio();
    if (prefs.chime) chime('FAST', prefs.volume);
    if (prefs.voice) setTimeout(() => speak('Pick up the pace.', prefs.volume), 600);
  };
  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

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
        <Section title="Sound and cues">
          <Toggle label="Spoken announcements" value={prefs.voice && caps.speech} onChange={v => setPrefs({ voice: v })}
            note={caps.speech ? 'Says each change of pace while your screen is on.' : 'Not available in this browser.'} />
          <Toggle label="Chimes" value={prefs.chime} onChange={v => setPrefs({ chime: v })}
            note="Rising for brisk, falling for easy. Keeps playing with your phone locked." />
          <Toggle label="Vibration" value={prefs.vibrate} onChange={v => setPrefs({ vibrate: v })}
            note={caps.vibrate ? undefined : 'Not supported here (iPhone browsers don’t allow it).'} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
            <Text style={[type.label, { flex: 1 }]}>Cue volume</Text>
            <Button label="Quieter" kind="secondary" icon="remove" style={{ minHeight: 48, paddingHorizontal: 12 }} onPress={() => setPrefs({ volume: Math.max(0, +(prefs.volume - 0.1).toFixed(1)) })} />
            <Text accessibilityLiveRegion="polite" style={[type.num, { width: 48, textAlign: 'center', color: ink.text, fontSize: 16 }]}>{vol}%</Text>
            <Button label="Louder" kind="secondary" icon="add" style={{ minHeight: 48, paddingHorizontal: 12 }} onPress={() => setPrefs({ volume: Math.min(1, +(prefs.volume + 0.1).toFixed(1)) })} />
          </View>
          <Button label="Test sound" icon="volume-medium-outline" kind="secondary" onPress={testSound} />
        </Section>

        <Section title="Display">
          <Toggle label="Bright light mode" value={prefs.brightMode} onChange={v => setPrefs({ brightMode: v })} note="Dark text on light during walks, for strong sunshine." />
          <Toggle label="Keep screen on during walks" value={prefs.keepAwake} onChange={v => setPrefs({ keepAwake: v })}
            note={caps.wakeLock ? undefined : 'Not supported in this browser.'} />
        </Section>

        <Section title="Walking world">
          <Card onPress={() => router.push('/worlds')} label={`Walking world: ${getWorld(prefs.world).name}. Change`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
            <Ionicons name="image-outline" size={22} color={ink.moss} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{getWorld(prefs.world).name}</Text>
              <Text style={type.small}>Change your scenery</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={ink.sub} />
          </Card>
          <Toggle label="3D scenery" value={prefs.scene3d} onChange={v => setPrefs({ scene3d: v })} note="Switch off for the lighter 2D artwork." />
          <Toggle label="Moving scenery during walks" value={prefs.walkScene} onChange={v => setPrefs({ walkScene: v })} note="Travel through your world at the pace of each phase." />
          <Toggle label="Low-power mode" value={prefs.lowPower} onChange={v => setPrefs({ lowPower: v })} note="Turns off scenery and animation everywhere to save battery." />
        </Section>

        <Section title="Account">
          <Card onPress={() => router.push('/profile')} label="Profile: username, photo and bio"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
            <Ionicons name="person-outline" size={22} color={ink.moss} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>Profile</Text>
              <Text style={type.small}>Username, photo and bio</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={ink.sub} />
          </Card>
          <Card onPress={() => router.push('/friends')} label="Friends"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
            <Ionicons name="heart-outline" size={22} color={ink.moss} />
            <Text style={[type.label, { flex: 1 }]}>Friends</Text>
            <Ionicons name="chevron-forward" size={20} color={ink.sub} />
          </Card>
          {confirmOut ? (
            <Card style={{ gap: 10 }}>
              <Text style={type.label}>Sign out of Spark Walk on this device?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Stay signed in" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmOut(false)} />
                <Button label="Sign out" kind="danger" style={{ flex: 1 }} onPress={signOut} />
              </View>
            </Card>
          ) : (
            <Button label="Sign out" icon="log-out-outline" kind="danger" onPress={() => setConfirmOut(true)} />
          )}
        </Section>

        <Text style={[type.small, { color: ink.faint, textAlign: 'center' }]}>
          Settings are saved on this device. Spark Walk doesn’t track your location.
        </Text>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text accessibilityRole="header" style={[type.title, { marginBottom: 4 }]}>{title}</Text>
      <Card style={{ gap: 2 }}>{children}</Card>
    </View>
  );
}
