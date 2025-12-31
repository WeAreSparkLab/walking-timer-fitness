import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, paceColors } from '../lib/theme';
import { getPlanById, Pace } from '../lib/storage';

// Web-safe haptics wrapper
const safeHaptics = {
  notificationAsync: (type: any) => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(type);
    }
  },
  impactAsync: (style: any) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(style);
    }
  },
};

type Interval = { pace: Pace; duration: number };

const PACE_STYLES: Record<Pace, { border: string; bg: string }> = {
  WARMUP: { border: '#00d98b', bg: 'rgba(0,217,139,0.15)' },
  FAST: { border: colors.accent, bg: 'rgba(138,43,226,0.14)' },
  SLOW: { border: colors.accent2, bg: 'rgba(0,234,255,0.14)' },
  COOLDOWN: { border: '#66a6ff', bg: 'rgba(102,166,255,0.15)' },
};

export default function WalkTimer() {
  const router = useRouter();
  const { planId } = useLocalSearchParams<{ planId?: string }>();

  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [ready, setReady] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const [currentInterval, setCurrentInterval] = useState(0);
  const [intervalTime, setIntervalTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentPace, setCurrentPace] = useState<Pace>('WARMUP');
  const intervalRef = useRef<any>(null);

  // Load plan or default (now includes warmup/cooldown)
  useEffect(() => {
    (async () => {
      if (planId) {
        const plan = await getPlanById(planId);
        if (plan) {
          const ivs = plan.intervals.map(i => ({ pace: i.pace as Pace, duration: i.minutes * 60 + i.seconds }));
          setIntervals(ivs);
          setReady(true);
          return;
        }
      }
      setIntervals([
        { pace: 'WARMUP', duration: 180 },
        { pace: 'FAST', duration: 300 },
        { pace: 'SLOW', duration: 180 },
        { pace: 'FAST', duration: 300 },
        { pace: 'SLOW', duration: 180 },
        { pace: 'COOLDOWN', duration: 180 },
      ]);
      setReady(true);
    })();
  }, [planId]);

  useEffect(() => {
    if (!ready || intervals.length === 0) return;
    setCurrentInterval(0);
    setIntervalTime(intervals[0].duration);
    setCurrentPace(intervals[0].pace);
    setTotalTime(intervals.reduce((s, i) => s + i.duration, 0));
  }, [ready, intervals]);

  useEffect(() => {
    if (!isRunning || intervals.length === 0) return;
    intervalRef.current = setInterval(() => {
      setTotalTime(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          setIsRunning(false);
          safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });

      setIntervalTime(prev => {
        if (prev <= 1) {
          setCurrentInterval(curr => {
            const next = curr + 1;
            const nextIv = intervals[next];
            if (nextIv) {
              setCurrentPace(nextIv.pace);
              safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              return next;
            }
            return curr;
          });
          return intervals[currentInterval + 1]?.duration ?? 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current!);
  }, [isRunning, currentInterval, intervals]);

  const resetTimer = () => {
    setIsRunning(false);
    const total = intervals.reduce((s, i) => s + i.duration, 0);
    setTotalTime(total);
    setCurrentInterval(0);
    setIntervalTime(intervals[0]?.duration ?? 0);
    setCurrentPace(intervals[0]?.pace ?? 'WARMUP');
    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const fmt = (s: number) => {
    const mm = Math.floor(s / 60).toString().padStart(2, '0');
    const ss = (s % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  const paceStyle = PACE_STYLES[currentPace];

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Walk Timer</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Pace badge */}
      <View style={styles.paceRow}>
        <Text style={styles.paceLabel}>Current Pace</Text>
        <View
          style={[
            styles.paceBadge,
            { borderColor: paceColors[currentPace].border, backgroundColor: paceColors[currentPace].bg }
          ]}
        >
          <Text style={[styles.paceText, { color: paceColors[currentPace].fg }]}>
            {currentPace}
          </Text>
        </View>
      </View>

      {/* Big timer */}
      <View style={styles.timerCard}>
        <Text style={styles.timer}>{fmt(intervalTime)}</Text>
        <Text style={styles.timerSub}>Interval {currentInterval + 1} / {intervals.length}</Text>
        <Text style={styles.totalLeft}>Total Left: {fmt(totalTime)}</Text>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => setIsRunning(!isRunning)}
          style={[styles.ctrl, { flex: 1 }]}
          activeOpacity={0.9}
        >
          <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.ctrlGrad}>
            <Ionicons name={isRunning ? 'pause' : 'play'} size={20} color={colors.text} />
            <Text style={styles.ctrlText}>{isRunning ? 'Pause' : 'Start'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={resetTimer} style={[styles.ctrlOutline, { flex: 1 }]} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color={colors.text} />
          <Text style={styles.ctrlOutlineText}>Reset</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  header: { paddingTop: 56, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  paceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  paceLabel: { color: colors.sub },
  paceBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  paceText: { color: colors.text, fontWeight: '800', letterSpacing: 1 },

  timerCard: {
    marginTop: 16, backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 26, borderWidth: 1, borderColor: colors.line,
    alignItems: 'center',
  },
  timer: { color: colors.text, fontSize: 64, fontWeight: '900', letterSpacing: 1 },
  timerSub: { color: colors.sub, marginTop: 6 },
  totalLeft: { color: colors.sub, marginTop: 2, fontSize: 12 },

  controls: { flexDirection: 'row', gap: 12, marginTop: 18 },
  ctrl: { borderRadius: radius.md, overflow: 'hidden' },
  ctrlGrad: { paddingVertical: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderRadius: radius.md },
  ctrlText: { color: colors.text, fontWeight: '800' },

  ctrlOutline: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  ctrlOutlineText: { color: colors.text, fontWeight: '800' },
});
