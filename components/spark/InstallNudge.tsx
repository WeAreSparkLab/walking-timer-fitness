// components/spark/InstallNudge.tsx — a quiet, dismissible "Install Spark Walk" card for home.
// Shown only where installing is possible; "Not now" hides it for 14 days.
// The full option always stays in Settings at the bottom of the home screen.
import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useInstall } from '../../lib/install';
import { ink } from '../../lib/spark/tokens';
import { Button, Card, type } from './ui';

const KEY = 'sparkwalk.installNudge.until';
const SNOOZE_MS = 14 * 24 * 3600 * 1000;

export default function InstallNudge({ onHowTo }: { onHowTo: () => void }) {
  const { kind, install } = useInstall();
  const [snoozed, setSnoozed] = useState(true); // hidden until we know

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(v => setSnoozed(!!v && Number(v) > Date.now())).catch(() => setSnoozed(false));
  }, []);

  if (snoozed || (kind !== 'prompt' && kind !== 'ios')) return null;

  const hide = () => { setSnoozed(true); AsyncStorage.setItem(KEY, String(Date.now() + SNOOZE_MS)).catch(() => {}); };

  return (
    <Card style={{ gap: 12, borderColor: 'rgba(242,166,90,0.45)', backgroundColor: 'rgba(242,166,90,0.08)' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Ionicons name="phone-portrait-outline" size={26} color={ink.ember} />
        <View style={{ flex: 1 }}>
          <Text style={type.label}>Install Spark Walk</Text>
          <Text style={type.small}>Opens like an app, straight from your home screen.</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {kind === 'prompt'
          ? <Button label="Install" icon="download-outline" style={{ flex: 1 }} onPress={async () => { const r = await install(); if (r === 'accepted') hide(); }} />
          : <Button label="Show me how" style={{ flex: 1 }} onPress={onHowTo} />}
        <Button label="Not now" kind="secondary" style={{ flex: 1 }} onPress={hide} />
      </View>
    </Card>
  );
}
