// app/join/[token].tsx — preview an invitation, then join with one tap.
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabaseClient';
import { previewInvite, redeemInvite, InvitePreview, PENDING_JOIN_KEY } from '../../lib/api/together';
import { segmentsFromIntervals, totalSeconds, fmtMinutes } from '../../lib/walk/schedule';
import { usePrefs } from '../../lib/spark/prefs';
import { getWorld } from '../../lib/spark/worlds';
import { ink, round, space } from '../../lib/spark/tokens';
import { Button, Card, Timeline, type, useSparkFonts } from '../../components/spark/ui';
import Scenery from '../../components/spark/Scenery';


export default function JoinByToken() {
  useSparkFonts();
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [prefs] = usePrefs();
  const [state, setState] = useState<'loading' | 'ready' | 'invalid' | 'joining'>('loading');
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const t = String(token || '');
      if (!t) return setState('invalid');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Remember the invitation, sign in, then come straight back here.
        try { await AsyncStorage.setItem(PENDING_JOIN_KEY, t); } catch {}
        router.replace('/');
        return;
      }
      try {
        const p = await previewInvite(t);
        if (!p || p.expired) { try { await AsyncStorage.removeItem(PENDING_JOIN_KEY); } catch {} return setState('invalid'); }
        setPreview(p);
        setState('ready');
      } catch {
        setState('invalid');
      }
    })();
  }, [token]);

  const join = async () => {
    setState('joining'); setError(null);
    try {
      const sid = await redeemInvite(String(token));
      try { await AsyncStorage.removeItem(PENDING_JOIN_KEY); } catch {}
      router.replace(`/together/${sid}`);
    } catch (e: any) {
      setError(/expired|valid/i.test(e?.message || '') ? 'This invitation has expired. Ask the host for a new link.' : 'Couldn’t join. Check your connection and try again.');
      setState('ready');
    }
  };

  const segs = segmentsFromIntervals((preview?.plan as any) || []);
  const world = getWorld(prefs.world);

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ height: 260 }}>{!prefs.lowPower ? <Scenery world={world} fadeTo={ink.bg} /> : null}</View>
      <View style={{ padding: space.lg, marginTop: -60, gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {state === 'loading' ? (
          <View style={{ alignItems: 'center', gap: 12 }}><ActivityIndicator color={ink.ember} /><Text style={type.body}>Opening your invitation…</Text></View>
        ) : state === 'invalid' ? (
          <>
            <Text accessibilityRole="header" style={type.display}>This invitation isn’t valid any more.</Text>
            <Text style={type.body}>Invitations last 7 days, and hosts can replace them. Ask the person who invited you for a new link.</Text>
            <Button label="Go to Spark Walk" onPress={() => router.replace('/dashboard')} />
          </>
        ) : (
          <>
            <Text style={type.eyebrow}>You’re invited</Text>
            <Text accessibilityRole="header" style={type.display}>{preview?.host_name || 'A friend'} would like to walk with you.</Text>
            <Card style={{ gap: 10 }}>
              <Text style={type.title}>{preview?.walk_name || 'Walk together'}</Text>
              <Text style={type.body}>{fmtMinutes(totalSeconds(segs))} · {segs.length} parts · {preview?.walkers} {preview?.walkers === 1 ? 'walker' : 'walkers'} so far</Text>
              <Timeline segments={segs} height={24} />
            </Card>
            <Text style={type.small}>You’ll each walk wherever you are, following the same walk at the same time. Nobody’s location is shared.</Text>
            {error ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.danger }]}>{error}</Text> : null}
            <Button big label={state === 'joining' ? 'Joining…' : 'Join the walk'} icon="walk" disabled={state === 'joining'} onPress={join} />
            <Button label="Not now" kind="quiet" onPress={() => router.replace('/dashboard')} />
          </>
        )}
      </View>
    </View>
  );
}
