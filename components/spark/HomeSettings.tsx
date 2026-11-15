// components/spark/HomeSettings.tsx — all app settings, at the bottom of the home screen.
// Saved on this device (lib/spark/prefs.ts).
import React, { useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabaseClient';
import { usePrefs } from '../../lib/spark/prefs';
import { capabilities, chime, speak, unlockAudio } from '../../lib/walk/cues';
import { useInstall, manualSteps } from '../../lib/install';
import { ink, space } from '../../lib/spark/tokens';
import { Button, Card, Toggle, type } from './ui';

export default function HomeSettings() {
  const router = useRouter();
  const [prefs, setPrefs] = usePrefs();
  const caps = useMemo(capabilities, []);
  const { kind, install } = useInstall();
  const [confirmOut, setConfirmOut] = useState(false);
  const [installMsg, setInstallMsg] = useState<string | null>(null);
  const vol = Math.round(prefs.volume * 100);

  const testSound = () => {
    unlockAudio();
    if (prefs.chime) chime('FAST', prefs.volume);
    if (prefs.voice) setTimeout(() => speak('Pick up the pace.', prefs.volume), 600);
  };
  const doInstall = async () => {
    const r = await install();
    setInstallMsg(r === 'accepted' ? 'Spark Walk is installing. Look for it on your home screen or apps list.' : r === 'dismissed' ? 'No problem. You can install it any time from here.' : null);
  };
  const signOut = async () => { await supabase.auth.signOut(); router.replace('/'); };

  return (
    <View nativeID="settings" style={{ gap: space.md }}>
      <Text accessibilityRole="header" style={type.title}>Settings</Text>

      {kind !== 'hidden' ? (
        <Group title="Install the app">
          {kind === 'installed' ? (
            <Text style={type.body}>Spark Walk is installed on this device. 🎉</Text>
          ) : kind === 'prompt' ? (
            <>
              <Text style={type.body}>Add Spark Walk to your home screen or desktop. It opens like an app, with no browser bars.</Text>
              <Button label="Install Spark Walk" icon="download-outline" onPress={doInstall} />
            </>
          ) : (
            <>
              <Text style={type.body}>{kind === 'ios' ? 'Add Spark Walk to your home screen so it opens like an app:' : 'Your browser can add Spark Walk like an app:'}</Text>
              {manualSteps(kind).map((s, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                  <Text style={[type.label, { width: 22, color: ink.ember }]}>{i + 1}.</Text>
                  <Text style={[type.body, { flex: 1 }]}>{s}</Text>
                </View>
              ))}
            </>
          )}
          {installMsg ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.ember }]}>{installMsg}</Text> : null}
        </Group>
      ) : null}

      <Group title="Sound and cues">
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
      </Group>

      <Group title="Display and battery">
        <Toggle label="Bright light mode" value={prefs.brightMode} onChange={v => setPrefs({ brightMode: v })} note="Dark text on light during walks, for strong sunshine." />
        <Toggle label="Keep screen on during walks" value={prefs.keepAwake} onChange={v => setPrefs({ keepAwake: v })}
          note={caps.wakeLock ? undefined : 'Not supported in this browser.'} />
        <Toggle label="3D scenery" value={prefs.scene3d} onChange={v => setPrefs({ scene3d: v })} note="Switch off for the lighter 2D artwork." />
        <Toggle label="Moving scenery during walks" value={prefs.walkScene} onChange={v => setPrefs({ walkScene: v })} note="Travel through your world at the pace of each phase. Uses more battery." />
        <Toggle label="Low-power mode" value={prefs.lowPower} onChange={v => setPrefs({ lowPower: v })} note="Turns off scenery and animation everywhere to save battery." />
      </Group>

      <Group title="Account">
        {confirmOut ? (
          <>
            <Text style={type.label}>Sign out of Spark Walk on this device?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Stay signed in" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmOut(false)} />
              <Button label="Sign out" kind="danger" style={{ flex: 1 }} onPress={signOut} />
            </View>
          </>
        ) : (
          <Button label="Sign out" icon="log-out-outline" kind="danger" onPress={() => setConfirmOut(true)} />
        )}
      </Group>

      <Text style={[type.small, { color: ink.faint, textAlign: 'center' }]}>
        Settings are saved on this device. Spark Walk doesn’t track your location.
      </Text>
    </View>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={[type.label, { color: ink.faint, textTransform: 'uppercase', letterSpacing: 1, fontSize: 13, marginBottom: 6 }]}>{title}</Text>
      {children}
    </Card>
  );
}
