// app/together/new.tsx — start a Walk Together: choose a walk, then go to the lobby.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPlans, WalkPlan } from '../../lib/storage';
import { createTogetherWalk } from '../../lib/api/together';
import { PRESETS, buildSegments, intervalsFromSegments, segmentsFromIntervals, totalSeconds, fmtMinutes, Segment } from '../../lib/walk/schedule';
import { ink, round, space } from '../../lib/spark/tokens';
import { Button, Card, Collapsible, Timeline, type, useSparkFonts } from '../../components/spark/ui';

type Choice = { key: string; name: string; segs: Segment[]; sub: string };

export default function NewTogether() {
  useSparkFonts();
  const router = useRouter();
  const [plans, setPlans] = useState<WalkPlan[]>([]);
  const [pick, setPick] = useState<string>('preset:gentle');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlans().then(ps => {
      setPlans(ps);
      const first = [...ps].sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite))[0];
      if (first) setPick(`plan:${first.id}`);
    });
  }, []);

  const choices: Choice[] = [
    ...[...plans].sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite)).map(p => {
      const segs = segmentsFromIntervals(p.intervals);
      return { key: `plan:${p.id}`, name: p.name, segs, sub: `${p.favourite ? '★ Favourite' : 'Your plan'} · ${fmtMinutes(totalSeconds(segs))}` };
    }),
    ...PRESETS.map(p => { const segs = buildSegments(p.structure); return { key: `preset:${p.id}`, name: p.name, segs, sub: `${p.blurb} · ${fmtMinutes(totalSeconds(segs))}` }; }),
  ];
  const chosen = choices.find(c => c.key === pick) ?? choices[0];

  const create = async () => {
    if (!chosen?.segs.length) return setError('Choose a walk first.');
    setBusy(true); setError(null);
    try {
      const { session } = await createTogetherWalk(name.trim() || chosen.name, intervalsFromSegments(chosen.segs));
      router.replace(`/together/${session.id}`);
    } catch (e: any) {
      setError('Couldn’t create the walk. Check your connection and try again.');
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.replace('/dashboard')} accessibilityRole="button" accessibilityLabel="Back to home" style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={ink.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.label, { flex: 1, textAlign: 'center' }]}>Walk together</Text>
        <View style={{ width: 48 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 60, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <View style={{ gap: 6 }}>
          <Text style={type.display}>Walk with friends, wherever they are.</Text>
          <Text style={type.body}>Everyone follows the same walk at the same moment. Nobody’s location is shared.</Text>
        </View>
        <Card style={{ gap: 14 }}>
          <Collapsible title="How it works" storageKey="sparkwalk.gw.howItWorks">
            {[
              ['1', 'Choose a walk', 'Pick a ready-made walk or one of your own.'],
              ['2', 'Invite friends', 'Share a private link. They join from anywhere.'],
              ['3', 'Walk together', 'You start it, and everyone follows the same walk.'],
            ].map(([n, h, d]) => (
              <View key={n} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: ink.ember, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[type.label, { color: ink.emberInk, fontSize: 14 }]}>{n}</Text>
                </View>
                <View style={{ flex: 1 }}><Text style={type.label}>{h}</Text><Text style={type.small}>{d}</Text></View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: round.sm, backgroundColor: 'rgba(156,197,161,0.1)' }}>
              <Ionicons name="information-circle-outline" size={20} color={ink.moss} style={{ marginTop: 1 }} />
              <Text style={[type.small, { flex: 1, color: ink.text }]}>
                Walks you create yourself are for walking on your own. To invite friends, create a group walk here.
              </Text>
            </View>
          </Collapsible>
        </Card>
        <View style={{ gap: 10 }}>
          <Text style={type.title}>1. Choose a walk</Text>
          {choices.map(c => {
            const on = c.key === chosen?.key;
            return (
              <Card key={c.key} onPress={() => setPick(c.key)} label={`${c.name}. ${c.sub}`}
                style={{ gap: 10, borderColor: on ? ink.ember : ink.line, borderWidth: on ? 2 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={22} color={on ? ink.ember : ink.faint} />
                  <View style={{ flex: 1 }}><Text style={type.label}>{c.name}</Text><Text style={type.small}>{c.sub}</Text></View>
                </View>
                <Timeline segments={c.segs} height={20} />
              </Card>
            );
          })}
          <Button label="Create your own walk" icon="add" kind="secondary"
            onPress={() => router.push({ pathname: '/create-walk', params: { returnTo: '/together/new' } })} a11yHint="Build a walk, then come back here to use it" />
        </View>
        <View style={{ gap: 8 }}>
          <Text nativeID="tname" style={type.title}>2. Name it (optional)</Text>
          <TextInput value={name} onChangeText={setName} accessibilityLabelledBy="tname" maxLength={60}
            placeholder={chosen?.name || 'Walk together'} placeholderTextColor={ink.faint}
            style={{ minHeight: 54, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 14, fontSize: 17, backgroundColor: 'rgba(0,0,0,0.2)' }} />
        </View>
        {error ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.danger }]}>{error}</Text> : null}
        <Button big label="Create and invite" icon="people" disabled={busy} onPress={create} />
      </ScrollView>
    </View>
  );
}
