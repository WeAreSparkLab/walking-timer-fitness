// app/create-walk.tsx — walk creator (redesign).
// The timeline, total and timer all use lib/walk/schedule.ts, so what you
// build here is exactly what the timer runs.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { savePlan, getPlanById, removePlan, Pace } from '../lib/storage';
import {
  PRESETS, PHASE_COPY, Segment, WalkStructure, LIMITS,
  buildSegments, structureFromSegments, segmentsFromIntervals, intervalsFromSegments,
  validateStructure, validateSegments, totalSeconds, fmtClock, fmtMinutes,
} from '../lib/walk/schedule';
import { ink, phaseTone, round, space } from '../lib/spark/tokens';
import { Button, Card, PhaseIcon, Timeline, Toggle, type, useSparkFonts } from '../components/spark/ui';

const PACES: Pace[] = ['WARMUP', 'FAST', 'SLOW', 'COOLDOWN'];
const stepFor = (sec: number) => (sec < 120 ? 15 : 30);

export default function CreateWalk() {
  useSparkFonts();
  const router = useRouter();
  const { editId, preset } = useLocalSearchParams<{ editId?: string; preset?: string }>();
  const [loaded, setLoaded] = useState(!editId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number>(Date.now());
  const [name, setName] = useState('');
  const [favourite, setFavourite] = useState(true);
  const [presetId, setPresetId] = useState<string>('classic');
  const [mode, setMode] = useState<'structure' | 'parts'>('structure');
  const [structure, setStructure] = useState<WalkStructure>(PRESETS[2].structure);
  const [parts, setParts] = useState<Segment[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      if (editId) {
        const p = await getPlanById(String(editId));
        if (p) {
          setPlanId(p.id); setName(p.name); setCreatedAt(p.createdAt); setFavourite(!!p.favourite);
          const segs = segmentsFromIntervals(p.intervals);
          const s = structureFromSegments(segs);
          setPresetId('custom');
          if (s) { setStructure(s); setMode('structure'); } else { setParts(segs); setMode('parts'); }
        }
        setLoaded(true);
        return;
      }
      const pr = PRESETS.find(p => p.id === preset);
      if (pr) { setPresetId(pr.id); setStructure(pr.structure); }
    })();
  }, [editId, preset]);

  const segments = useMemo(() => (mode === 'structure' ? buildSegments(structure) : parts), [mode, structure, parts]);
  const problem = mode === 'structure' ? validateStructure(structure) : validateSegments(parts);
  const total = totalSeconds(segments);

  const pickPreset = (id: string) => {
    setPresetId(id);
    setError(null);
    const pr = PRESETS.find(p => p.id === id);
    if (pr) { setMode('structure'); setStructure(pr.structure); }
  };
  const setPart = (patch: Partial<WalkStructure>) => { setPresetId('custom'); setStructure(s => ({ ...s, ...patch })); };
  const toParts = () => { setParts(buildSegments(structure)); setMode('parts'); setPresetId('custom'); };

  const save = async (startAfter: boolean) => {
    const msg = problem ?? (!name.trim() ? 'Give your walk a name so you can find it again.' : null);
    if (msg) return setError(msg);
    setSaving(true);
    const id = planId ?? uuid();
    await savePlan({ id, name: name.trim(), intervals: intervalsFromSegments(segments), createdAt, favourite });
    if (startAfter) router.replace({ pathname: '/walk', params: { planId: id } });
    else router.replace('/dashboard');
  };

  const del = async () => {
    if (!planId) return;
    await removePlan(planId);
    router.replace('/dashboard');
  };

  if (!loaded) return <View style={{ flex: 1, backgroundColor: ink.bg }} />;

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' }}>
        <Pressable onPress={() => router.replace('/dashboard')} accessibilityRole="button" accessibilityLabel="Back to home without saving"
          style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={ink.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.label, { flex: 1, textAlign: 'center' }]}>{planId ? 'Edit walk' : 'Create a walk'}</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 220, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {/* Name */}
        <View style={{ gap: 8 }}>
          <Text nativeID="nameLabel" style={type.label}>Name</Text>
          <TextInput value={name} onChangeText={t => { setName(t); setError(null); }} accessibilityLabelledBy="nameLabel"
            placeholder="e.g. Lunchtime loop" placeholderTextColor={ink.faint} maxLength={60}
            style={{ minHeight: 54, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 14, fontSize: 17, backgroundColor: 'rgba(0,0,0,0.2)' }} />
        </View>

        {/* Presets */}
        <View style={{ gap: 10 }}>
          <Text style={type.label}>Start from</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {[...PRESETS.map(p => ({ id: p.id, name: p.name })), { id: 'custom', name: 'Custom walk' }].map(p => {
              const on = presetId === p.id;
              return (
                <Pressable key={p.id} onPress={() => pickPreset(p.id)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                  style={{ minHeight: 48, paddingHorizontal: 16, borderRadius: round.pill, borderWidth: 1.5, borderColor: on ? ink.ember : ink.line, backgroundColor: on ? 'rgba(242,166,90,0.14)' : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {on ? <Ionicons name="checkmark" size={16} color={ink.ember} /> : null}
                  <Text style={[type.label, { fontSize: 15 }]}>{p.name}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[type.small, { color: ink.faint }]}>Ready-made walks are examples, not medical advice. Adjust anything to suit you.</Text>
        </View>

        {/* Builder */}
        {mode === 'structure' ? (
          <Card style={{ gap: 4 }}>
            <Stepper pace="WARMUP" label="Warm up" seconds={structure.warmup} min={0} onChange={v => setPart({ warmup: v })} />
            <Stepper pace="FAST" label="Brisk (pick up the pace)" seconds={structure.fast} min={0} onChange={v => setPart({ fast: v })} />
            <Stepper pace="SLOW" label="Easy (ease back)" seconds={structure.slow} min={0} onChange={v => setPart({ slow: v })} />
            <CountStepper value={structure.repeats} onChange={v => setPart({ repeats: v })} />
            <Stepper pace="COOLDOWN" label="Cool down" seconds={structure.cooldown} min={0} onChange={v => setPart({ cooldown: v })} />
            <Button label="Fine-tune each part" icon="list-outline" kind="quiet" onPress={toParts} style={{ marginTop: 4 }} />
          </Card>
        ) : (
          <Card style={{ gap: 12 }}>
            <Text style={type.label}>Parts, in order</Text>
            {parts.map((p, i) => (
              <View key={i} style={{ gap: 6, paddingBottom: 10, borderBottomWidth: i < parts.length - 1 ? 1 : 0, borderBottomColor: ink.line }}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {PACES.map(pc => {
                    const on = p.pace === pc;
                    return (
                      <Pressable key={pc} onPress={() => setParts(ps => ps.map((x, j) => (j === i ? { ...x, pace: pc } : x)))}
                        accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`Part ${i + 1}: ${PHASE_COPY[pc].short}`}
                        style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: round.pill, borderWidth: 1.5, borderColor: on ? phaseTone[pc].dark : ink.line, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <PhaseIcon pace={pc} size={16} color={on ? phaseTone[pc].dark : ink.faint} />
                        <Text style={[type.small, { color: on ? ink.text : ink.sub, fontWeight: '600' }]}>{PHASE_COPY[pc].short}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Stepper pace={p.pace} label={`Part ${i + 1}`} seconds={p.seconds} min={5} hideIcon
                      onChange={v => setParts(ps => ps.map((x, j) => (j === i ? { ...x, seconds: v } : x)))} />
                  </View>
                  <Pressable onPress={() => setParts(ps => ps.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove part ${i + 1}`}
                    style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="trash-outline" size={20} color={ink.danger} />
                  </Pressable>
                </View>
              </View>
            ))}
            <Button label="Add a part" icon="add" kind="secondary"
              onPress={() => setParts(ps => [...ps, { pace: ps[ps.length - 1]?.pace === 'FAST' ? 'SLOW' : 'FAST', seconds: 120 }])} />
          </Card>
        )}

        <Toggle label="Favourite" value={favourite} onChange={setFavourite} note="Favourites appear first on your home screen." />

        {planId ? (
          confirmDelete ? (
            <Card style={{ gap: 10, borderColor: 'rgba(255,138,122,0.5)' }}>
              <Text style={type.label}>Delete “{name || 'this walk'}”? This can’t be undone.</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Keep it" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirmDelete(false)} />
                <Button label="Delete" kind="danger" style={{ flex: 1 }} onPress={del} />
              </View>
            </Card>
          ) : (
            <Button label="Delete this walk" icon="trash-outline" kind="danger" onPress={() => setConfirmDelete(true)} />
          )
        ) : null}
      </ScrollView>

      {/* Sticky summary: always shows exactly what the timer will run */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: ink.bg2, borderTopWidth: 1, borderTopColor: ink.line, padding: space.md, paddingBottom: 24 }}>
        <View style={{ maxWidth: 600, width: '100%', alignSelf: 'center', gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={type.eyebrow}>Total</Text>
            <Text accessibilityLiveRegion="polite" style={[type.num, { color: ink.text, fontSize: 22 }]}>
              {fmtClock(total)} <Text style={type.small}>· {segments.length} parts</Text>
            </Text>
          </View>
          {segments.length ? <Timeline segments={segments} height={26} /> : null}
          {error || problem ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: error ? ink.danger : ink.sub }]}>{error || problem}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Save" kind="secondary" style={{ flex: 1 }} disabled={saving} onPress={() => save(false)} />
            <Button label="Save and start" icon="play" style={{ flex: 1.6 }} disabled={saving} onPress={() => save(true)} />
          </View>
        </View>
      </View>
    </View>
  );
}

function Stepper({ pace, label, seconds, min, onChange, hideIcon }: { pace: Pace; label: string; seconds: number; min: number; onChange: (v: number) => void; hideIcon?: boolean }) {
  const dec = () => onChange(Math.max(min, seconds - stepFor(seconds - 1)));
  const inc = () => onChange(Math.min(LIMITS.maxSegmentSeconds, seconds + stepFor(seconds)));
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60 }}>
      {!hideIcon ? <PhaseIcon pace={pace} size={22} /> : null}
      <Text style={[type.label, { flex: 1, fontSize: 15 }]}>{label}</Text>
      <StepBtn icon="remove" label={`Less ${label}`} onPress={dec} disabled={seconds <= min} />
      <Text accessibilityLabel={`${label}: ${fmtMinutes(seconds)}`} style={[type.num, { width: 64, textAlign: 'center', color: seconds ? ink.text : ink.faint, fontSize: 18 }]}>{fmtClock(seconds)}</Text>
      <StepBtn icon="add" label={`More ${label}`} onPress={inc} disabled={seconds >= LIMITS.maxSegmentSeconds} />
    </View>
  );
}

function CountStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingLeft: 32 }}>
      <Text style={[type.label, { flex: 1, fontSize: 15 }]}>Repeat brisk + easy</Text>
      <StepBtn icon="remove" label="Fewer repeats" onPress={() => onChange(Math.max(0, value - 1))} disabled={value <= 0} />
      <Text accessibilityLabel={`${value} repeats`} style={[type.num, { width: 64, textAlign: 'center', color: ink.text, fontSize: 18 }]}>× {value}</Text>
      <StepBtn icon="add" label="More repeats" onPress={() => onChange(Math.min(LIMITS.maxRepeats, value + 1))} disabled={value >= LIMITS.maxRepeats} />
    </View>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: any; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(246,241,231,0.1)', opacity: disabled ? 0.35 : pressed ? 0.7 : 1 })}>
      <Ionicons name={icon} size={22} color={ink.text} />
    </Pressable>
  );
}
