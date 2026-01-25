import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, paceColors } from '../lib/theme';
import 'react-native-get-random-values';
import { v4 as uuid } from 'uuid';
import { savePlan, getPlanById, removePlan, Pace } from '../lib/storage';

type IntervalItem = { pace: Pace; minutes: number; seconds: number };

export default function CreateWalk() {
  const router = useRouter();
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  const [walkId, setWalkId] = useState<string | null>(null);
  const [walkName, setWalkName] = useState('');
  const [intervals, setIntervals] = useState<IntervalItem[]>([
    { pace: 'WARMUP', minutes: 3, seconds: 0 },
    { pace: 'FAST', minutes: 5, seconds: 0 },
    { pace: 'SLOW', minutes: 3, seconds: 0 },
    { pace: 'COOLDOWN', minutes: 3, seconds: 0 },
  ]);

  // Load existing plan if editing
  useEffect(() => {
    if (editId) {
      (async () => {
        const plan = await getPlanById(editId);
        if (plan) {
          setWalkId(plan.id);
          setWalkName(plan.name);
          setIntervals(plan.intervals);
        }
      })();
    }
  }, [editId]);

  const addInterval = () => setIntervals(prev => [...prev, { pace: 'SLOW', minutes: 3, seconds: 0 }]);
  const removeInterval = (idx: number) => setIntervals(prev => prev.filter((_, i) => i !== idx));
  const update = (idx: number, patch: Partial<IntervalItem>) =>
    setIntervals(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const saveWalk = async () => {
    const cleaned = intervals
      .map(iv => ({
        pace: iv.pace,
        minutes: Math.max(0, iv.minutes | 0),
        seconds: Math.max(0, Math.min(59, iv.seconds | 0)),
      }))
      .filter(iv => iv.minutes > 0 || iv.seconds > 0);

    if (!walkName.trim()) {
      Alert.alert('Name Required', 'Please enter a name for this walk');
      return;
    }
    if (cleaned.length === 0) {
      Alert.alert('No Intervals', 'Please add at least one interval with time > 0');
      return;
    }

    await savePlan({
      id: walkId || uuid(),
      name: walkName,
      intervals: cleaned,
      createdAt: Date.now(),
    });
    router.push('/dashboard');
  };

  const handleDeleteWalk = async () => {
    if (!editId) return;
    
    Alert.alert(
      'Delete Walk',
      'Are you sure you want to delete this walk?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            await removePlan(editId);
            router.replace('/dashboard');
          }
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.iconBtn}>
          <Text style={styles.iconText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{editId ? 'Edit Walk' : 'Create Walk'}</Text>
        {editId && (
          <TouchableOpacity onPress={handleDeleteWalk} style={styles.iconBtn}>
            <Ionicons name="trash-outline" size={24} color={colors.danger} />
          </TouchableOpacity>
        )}
        {!editId && <View style={{ width: 36 }} />}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: pad.lg }}>

        <View style={styles.block}>
          <Text style={styles.label}>Walk name</Text>
          <TextInput
            value={walkName}
            onChangeText={setWalkName}
            placeholder="e.g. 30-min Intervals"
            placeholderTextColor={colors.sub}
            style={styles.input}
          />
        </View>

        <Text style={styles.sectionTitle}>Intervals</Text>
        {intervals.map((iv, idx) => (
          <View key={idx} style={styles.rowCard}>
            <View style={styles.chipsRow}>
              {(['WARMUP', 'FAST', 'SLOW', 'COOLDOWN'] as Pace[]).map(p => {
                const active = iv.pace === p;
                const pc = paceColors[p];
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.chip,
                      active && { borderColor: pc.border, backgroundColor: pc.bg }
                    ]}
                    onPress={() => update(idx, { pace: p })}
                  >
                    <Text style={[styles.chipText, active && { color: pc.fg }]}>{p}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.timeRow}>
              <View style={styles.timeCol}>
                <Text style={styles.labelSm}>Min</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={String(iv.minutes)}
                  onChangeText={(t) => update(idx, { minutes: parseInt(t || '0') })}
                  style={styles.inputSm}
                />
              </View>
              <View style={styles.timeCol}>
                <Text style={styles.labelSm}>Sec</Text>
                <TextInput
                  keyboardType="number-pad"
                  value={String(iv.seconds)}
                  onChangeText={(t) => update(idx, { seconds: parseInt(t || '0') })}
                  style={styles.inputSm}
                />
              </View>

              <TouchableOpacity onPress={() => removeInterval(idx)} style={styles.trashBtn}>
                <Text style={[styles.iconText, { color: colors.danger, fontSize: 18 }]}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addInterval} style={styles.addBtn} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color={colors.accent} />
          <Text style={styles.addText}>Add Interval</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={saveWalk} activeOpacity={0.9}>
          <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.saveBtn}>
            <Text style={styles.saveText}>Save Walk</Text>
          </LinearGradient>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  header: { paddingTop: 56, paddingHorizontal: pad.lg, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  iconText: { color: colors.text, fontSize: 20 },

  block: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.md, borderWidth: 1, borderColor: colors.line, marginBottom: 16,
  },
  label: { color: colors.sub, marginBottom: 8, fontSize: 12, letterSpacing: 0.3 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: colors.text, borderRadius: radius.md, paddingHorizontal: 14, height: 46,
  },

  sectionTitle: { color: colors.text, fontWeight: '800', marginBottom: 10, marginTop: 6 },
  rowCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.md, borderWidth: 1, borderColor: colors.line, marginBottom: 12 },
  chipsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(255,255,255,0.03)' },
  chipActive: { borderColor: colors.accent },
  chipText: { color: colors.sub, fontWeight: '700', fontSize: 12 },
  chipTextActive: { color: colors.text },

  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeCol: { flex: 1 },
  labelSm: { color: colors.sub, fontSize: 12, marginBottom: 6 },
  inputSm: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: colors.text, borderRadius: radius.md, paddingHorizontal: 12, height: 42,
  },
  trashBtn: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  addBtn: {
    marginTop: 4, marginBottom: 16, borderRadius: radius.md, padding: 12, borderWidth: 1, borderColor: colors.accent,
    borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  addText: { color: colors.accent, fontWeight: '700' },

  saveBtn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', marginBottom: 40 },
  saveText: { color: colors.text, fontWeight: '800' },
});
