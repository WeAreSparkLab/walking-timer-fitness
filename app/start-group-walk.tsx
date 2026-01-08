import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Share, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius } from '../lib/theme';
import { getPlans } from '../lib/storage';
import { createSession, createInvite, startSession } from '../lib/api/sessions';
import { listMyFriends } from '../lib/api/friends';

export default function StartGroupWalk() {
  const router = useRouter();
  const [sessionName, setSessionName] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [plansData, friendsData] = await Promise.all([
      getPlans(),
      listMyFriends().catch(() => [])
    ]);
    setPlans(plansData);
    setFriends(friendsData);
  };

  const handleCreateSession = async () => {
    console.log('handleCreateSession called', { sessionName, selectedPlan });
    
    if (!sessionName.trim()) {
      if (Platform.OS === 'web') {
        window.alert('Please enter a name for this group walk');
      } else {
        Alert.alert('Name Required', 'Please enter a name for this group walk');
      }
      return;
    }
    if (!selectedPlan) {
      if (Platform.OS === 'web') {
        window.alert('Please select a walk plan');
      } else {
        Alert.alert('Plan Required', 'Please select a walk plan');
      }
      return;
    }

    try {
      console.log('Creating session...', { name: sessionName, intervals: selectedPlan.intervals });
      const session = await createSession(sessionName, selectedPlan.intervals);
      console.log('Session created:', session);
      setSessionId(session.id);
      
      // Generate invite token
      console.log('Creating invite...');
      const token = await createInvite(session.id);
      console.log('Invite token:', token);
      const link = `sparkwalk://join/${token}`;
      setInviteLink(link);
      
      if (Platform.OS === 'web') {
        window.alert('Session created! Share the invite link with your friends');
      } else {
        Alert.alert('Session Created!', 'Share the invite link with your friends');
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      if (Platform.OS === 'web') {
        window.alert(`Error: Failed to create session - ${error.message || error}`);
      } else {
        Alert.alert('Error', 'Failed to create session');
      }
    }
  };

  const handleShareInvite = async () => {
    if (!inviteLink) return;
    
    try {
      await Share.share({
        message: `Join my walk on Spark Walk! ${inviteLink}`,
        title: 'Join Group Walk',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const handleStartWalk = async () => {
    if (!sessionId) return;
    
    try {
      console.log('Starting session:', sessionId);
      await startSession(sessionId);
      router.replace(`/walk-timer?sessionId=${sessionId}`);
    } catch (error) {
      console.error('Failed to start session:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to start walk');
      } else {
        Alert.alert('Error', 'Failed to start walk');
      }
    }
  };

  if (inviteLink && sessionId) {
    return (
      <View style={styles.container}>
        <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
        
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.replace('/dashboard')} style={styles.iconBtn}>
            <Ionicons name="close" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ready to Walk!</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.successCard}>
            <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
            <Text style={styles.successTitle}>{sessionName}</Text>
            <Text style={styles.successSub}>Session created successfully</Text>
          </View>

          <View style={styles.inviteSection}>
            <Text style={styles.label}>Invite Friends</Text>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
            </View>
            <TouchableOpacity onPress={handleShareInvite} style={styles.shareBtn} activeOpacity={0.85}>
              <Ionicons name="share-outline" size={18} color={colors.accent} />
              <Text style={styles.shareBtnText}>Share Invite Link</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={handleStartWalk} activeOpacity={0.9} style={styles.startBtnWrapper}>
            <LinearGradient 
              colors={[colors.accent, colors.accent2]} 
              start={{ x: 0, y: 0.5 }} 
              end={{ x: 1, y: 0.5 }} 
              style={styles.startBtn}
            >
              <Text style={styles.startBtnText}>Start Walking</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/dashboard')} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Start Group Walk</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={styles.section}>
          <Text style={styles.label}>Walk Name</Text>
          <TextInput
            value={sessionName}
            onChangeText={setSessionName}
            placeholder="e.g. Morning Power Walk"
            placeholderTextColor={colors.sub}
            style={styles.input}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Select Walk Plan</Text>
          {plans.length === 0 ? (
            <Text style={styles.emptyText}>No walk plans yet. Create one first!</Text>
          ) : (
            plans.map((plan) => (
              <TouchableOpacity
                key={plan.id}
                onPress={() => setSelectedPlan(plan)}
                style={[
                  styles.planCard,
                  selectedPlan?.id === plan.id && styles.planCardSelected
                ]}
                activeOpacity={0.7}
              >
                <View style={styles.planCardContent}>
                  <Ionicons 
                    name={selectedPlan?.id === plan.id ? "radio-button-on" : "radio-button-off"} 
                    size={20} 
                    color={selectedPlan?.id === plan.id ? colors.accent : colors.sub} 
                  />
                  <Text style={styles.planName}>{plan.name}</Text>
                </View>
                <Text style={styles.planIntervals}>
                  {plan.intervals.length} intervals
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <TouchableOpacity 
          onPress={handleCreateSession} 
          activeOpacity={0.9}
          style={styles.createBtnWrapper}
        >
          <LinearGradient 
            colors={[colors.accent, colors.accent2]} 
            start={{ x: 0, y: 0.5 }} 
            end={{ x: 1, y: 0.5 }} 
            style={styles.createBtn}
          >
            <Text style={styles.createBtnText}>Create Session</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  header: { 
    paddingTop: 56, 
    paddingHorizontal: pad.lg, 
    paddingBottom: 10, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between' 
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  iconBtn: { 
    width: 36, 
    height: 36, 
    alignItems: 'center', 
    justifyContent: 'center', 
    borderRadius: 999, 
    backgroundColor: 'rgba(255,255,255,0.06)', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)' 
  },

  content: { 
    flex: 1, 
    paddingHorizontal: pad.lg,
  },

  section: {
    marginTop: 20,
  },

  label: { 
    color: colors.sub, 
    marginBottom: 8, 
    fontSize: 12, 
    letterSpacing: 0.3,
    fontWeight: '600',
  },

  input: {
    backgroundColor: 'rgba(255,255,255,0.04)', 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
    color: colors.text, 
    borderRadius: radius.md, 
    paddingHorizontal: 14, 
    height: 46,
  },

  planCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: pad.md,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  planCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(138,43,226,0.08)',
  },

  planCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },

  planName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },

  planIntervals: {
    color: colors.sub,
    fontSize: 12,
  },

  emptyText: {
    color: colors.sub,
    textAlign: 'center',
    padding: 20,
  },

  createBtnWrapper: {
    marginTop: 24,
  },

  createBtn: {
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },

  createBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 16,
  },

  successCard: {
    alignItems: 'center',
    paddingVertical: 40,
  },

  successTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800',
    marginTop: 16,
  },

  successSub: {
    color: colors.sub,
    marginTop: 4,
  },

  inviteSection: {
    marginTop: 24,
  },

  linkBox: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 12,
  },

  linkText: {
    color: colors.text,
    fontSize: 12,
    fontFamily: 'monospace',
  },

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  shareBtnText: {
    color: colors.accent,
    fontWeight: '700',
  },

  startBtnWrapper: {
    marginTop: 32,
  },

  startBtn: {
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },

  startBtnText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
  },
});
