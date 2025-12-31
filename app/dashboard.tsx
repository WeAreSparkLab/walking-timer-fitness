//app/dashboard.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, pad, shadow } from '../lib/theme';
import { getPlans, removePlan, WalkPlan } from '../lib/storage';
import { createAndShareInvite } from '../lib/actions/invites';
import { useMyProfile } from '../lib/useMyProfile';
import { supabase } from '../lib/supabaseClient';


export default function Dashboard() {
  const router = useRouter();
  const [plans, setPlans] = useState<WalkPlan[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const { username, avatarUrl } = useMyProfile();

  // Check authentication on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/');
      } else {
        setIsAuthenticated(true);
      }
      setCheckingAuth(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/');
      } else {
        setIsAuthenticated(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleCreateGroupWalk() {
    // pick a plan (first saved or a default)
    const plans: WalkPlan[] = await getPlans();
    const plan = plans[0]?.intervals ?? [
      { pace: 'WARMUP', minutes: 3, seconds: 0 },
      { pace: 'FAST', minutes: 5, seconds: 0 },
      { pace: 'SLOW', minutes: 3, seconds: 0 },
      { pace: 'FAST', minutes: 5, seconds: 0 },
      { pace: 'SLOW', minutes: 3, seconds: 0 },
      { pace: 'COOLDOWN', minutes: 3, seconds: 0 },
    ];

    await createAndShareInvite(plans[0]?.name ?? 'Group Walk', plan);
  }

  useFocusEffect(useCallback(() => {
    let alive = true;
    (async () => {
      const p = await getPlans();
      if (alive) setPlans(p);
    })();
    return () => { alive = false; };
  }, []));

  useEffect(() => { (async () => setPlans(await getPlans()))(); }, []);

  if (checkingAuth) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.25)', 'rgba(0,234,255,0.10)']} style={styles.bgGlow} />

      {/* Hero */}
      <View style={styles.hero}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Spark Walk</Text>
          <Text style={styles.subtitle}>
            {username ? `Let’s get moving, ${username}.` : `Let’s get moving.`}
          </Text>
        </View>
        <TouchableOpacity style={styles.settingsButton} onPress={() => router.push('/profile')}>
          <Ionicons name="settings-outline" size={22} color={colors.sub} />
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>13</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>{plans.length}</Text>
            <Text style={styles.statLabel}>Saved Plans</Text>
          </View>
        </View>

        {/* Primary CTAs */}
        <TouchableOpacity
          style={[styles.primaryCta, shadow.card]}
          onPress={() => router.push('/walk-timer')}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.accent, colors.accent2]}
            start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
            style={styles.primaryCtaGrad}
          >
            <Text style={styles.primaryCtaText}>Start a Walk</Text>
            <Ionicons name="walk-outline" size={22} color={colors.text} />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={handleCreateGroupWalk}
          activeOpacity={0.8}
        >
          <Ionicons name="people-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryCtaText}>Create Group Walk (invite)</Text>
        </TouchableOpacity>


        <TouchableOpacity style={styles.secondaryCta} activeOpacity={0.8}>
          <Ionicons name="share-social-outline" size={18} color={colors.text} />
          <Text style={styles.secondaryCtaText}>Invite Friend</Text>
        </TouchableOpacity>

        {/* Plans List */}
        <Text style={styles.sectionTitle}>My Custom Walks</Text>
        {plans.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No custom walks yet.</Text>
          </View>
        ) : (
          plans.map(plan => (
            <TouchableOpacity
              key={plan.id}
              style={styles.planCard}
              onPress={() => router.push({ pathname: '/walk-timer', params: { planId: plan.id } })}
              onLongPress={() => {
                Alert.alert('Delete', `Remove "${plan.name}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                      await removePlan(plan.id);
                      setPlans(await getPlans());
                    }
                  },
                ]);
              }}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planMeta}>
                  {Math.floor(plan.intervals.reduce((s, i) => s + i.minutes * 60 + i.seconds, 0) / 60)} min · {plan.intervals.length} intervals
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.sub} />
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity style={styles.createButton} onPress={() => router.push('/create-walk')} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color={colors.accent} />
          <Text style={styles.createText}>Create a New Walk</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  hero: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 18 },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.sub, marginTop: 6 },
  settingsButton: { padding: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  content: { flex: 1 },
  statsRow: { flexDirection: 'row', gap: 14, marginBottom: 22 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.md,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center',
  },
  statNumber: { color: colors.text, fontSize: 28, fontWeight: '800' },
  statLabel: { color: colors.sub, marginTop: 4, fontSize: 12, letterSpacing: 0.2 },
  primaryCta: { borderRadius: radius.lg, overflow: 'hidden', marginBottom: 12 },
  primaryCtaGrad: { paddingVertical: 18, paddingHorizontal: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  primaryCtaText: { color: colors.text, fontSize: 18, fontWeight: '800' },
  secondaryCta: {
    backgroundColor: colors.card, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 28,
  },
  secondaryCtaText: { color: colors.text, fontWeight: '700' },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  planCard: {
    backgroundColor: colors.card, borderRadius: radius.md, padding: pad.md, borderWidth: 1, borderColor: colors.line,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  planName: { color: colors.text, fontSize: 16, fontWeight: '600' },
  planMeta: { color: colors.sub, marginTop: 4, fontSize: 12 },
  emptyCard: { backgroundColor: colors.card, borderRadius: radius.md, padding: pad.md, borderWidth: 1, borderColor: colors.line, alignItems: 'center' },
  emptyText: { color: colors.sub },
  createButton: {
    marginTop: 6, marginBottom: 32, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.accent,
    borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  createText: { color: colors.accent, fontWeight: '700' },
});
