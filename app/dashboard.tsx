//app/dashboard.tsx
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator, Image, Modal } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, radius, pad, shadow } from '../lib/theme';
import { getPlans, removePlan, WalkPlan } from '../lib/storage';
import { createAndShareInvite } from '../lib/actions/invites';
import { listMyFriends } from '../lib/api/friends';
import { useMyProfile } from '../lib/useMyProfile';
import { supabase } from '../lib/supabaseClient';
import { Platform } from 'react-native';
import { getUserStats, getPeriodStats, formatDuration, UserStats, PeriodStats } from '../lib/api/stats';


type GroupWalk = {
  id: string;
  name: string;
  created_at: string;
  status: string;
  host_id: string;
  participants: Array<{
    user_id: string;
    username?: string;
    avatar_url?: string;
  }>;
};

export default function Dashboard() {
  const router = useRouter();
  const [plans, setPlans] = useState<WalkPlan[]>([]);
  const [groupWalks, setGroupWalks] = useState<GroupWalk[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<PeriodStats>({ points: 0, walks: 0, duration_seconds: 0 });
  const [monthlyStats, setMonthlyStats] = useState<PeriodStats>({ points: 0, walks: 0, duration_seconds: 0 });
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'all'>('all');
  const { username, avatarUrl } = useMyProfile();
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedSession, setSelectedSession] = useState<{ id: string; token: string; name: string } | null>(null);
  const [friends, setFriends] = useState<Array<{ id: string; username: string; avatar_url?: string }>>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Check authentication on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/');
      } else {
        setIsAuthenticated(true);
        setCurrentUserId(session.user.id);
        // Load data after confirming authentication
        loadInitialData();
      }
      setCheckingAuth(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.replace('/');
      } else {
        setIsAuthenticated(true);
        setCurrentUserId(session.user.id);
        loadInitialData();
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadInitialData = async () => {
    console.log('Loading initial data...');
    const plans = await getPlans();
    console.log('Loaded plans:', plans.length);
    setPlans(plans);
    await loadGroupWalks();
    await loadStats();
    await loadFriends();
  };

  const loadFriends = async () => {
    try {
      const { data } = await listMyFriends();
      if (data) {
        setFriends(data.map(f => ({
          id: f.friend.id,
          username: f.friend.username || 'User',
          avatar_url: f.friend.avatar_url
        })));
      }
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const loadStats = async () => {
    try {
      const [userStats, weekly, monthly] = await Promise.all([
        getUserStats(),
        getPeriodStats('week'),
        getPeriodStats('month'),
      ]);
      setStats(userStats);
      setWeeklyStats(weekly);
      setMonthlyStats(monthly);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const handleCopyLink = async (link: string) => {
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(link);
        window.alert('Invite link copied to clipboard!');
      } catch (err) {
        console.error('Failed to copy:', err);
        window.alert(`Invite link:\n\n${link}`);
      }
    }
  };

  const handleShareSocial = (platform: string, link: string, walkName: string) => {
    const text = `Join my group walk: ${walkName}`;
    const message = `${text} ${link}`;
    const encodedMessage = encodeURIComponent(message);
    const encodedUrl = encodeURIComponent(link);
    const encodedText = encodeURIComponent(text);
    
    let url = '';
    switch (platform) {
      case 'whatsapp':
        url = `https://wa.me/?text=${encodedMessage}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/dialog/send?link=${encodedUrl}&app_id=0&redirect_uri=${encodeURIComponent(window.location.href)}`;
        break;
      case 'instagram':
        // Instagram doesn't support URL-based sharing on web, so copy and notify
        handleCopyLink(link);
        window.alert('Link copied! Open Instagram and paste it in a message.');
        return;
      case 'telegram':
        url = `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`;
        break;
    }
    
    if (url && Platform.OS === 'web') {
      window.open(url, '_blank');
    }
  };

  const handleShareToFriend = async (friendId: string, friendName: string, link: string) => {
    await handleCopyLink(link);
    window.alert(`Link copied! Now you can send it to ${friendName}`);
    setShareModalVisible(false);
  };

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

  const loadGroupWalks = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found');
        return;
      }

      console.log('Loading group walks for user:', user.id);

      const { data, error } = await supabase
        .from('session_participants')
        .select('session_id')
        .eq('user_id', user.id);

      console.log('Session participants query result:', { data, error });

      if (error) {
        console.error('Error loading participants:', error);
        return;
      }

      if (!data || data.length === 0) {
        console.log('No session participants found');
        setGroupWalks([]);
        return;
      }

      const sessionIds = data.map(d => d.session_id);
      console.log('Found session IDs:', sessionIds);

      const { data: sessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, name, created_at, status, host_id')
        .in('id', sessionIds)
        .order('created_at', { ascending: false });

      console.log('Sessions query result:', { sessions, sessionsError });

      if (sessions && sessions.length > 0) {
        // Fetch participants for each session
        const sessionsWithParticipants = await Promise.all(
          sessions.map(async (session) => {
            // Get participant user IDs
            const { data: participants } = await supabase
              .from('session_participants')
              .select('user_id')
              .eq('session_id', session.id);

            if (!participants || participants.length === 0) {
              return { ...session, participants: [] };
            }

            const userIds = participants.map(p => p.user_id);

            // Fetch profiles for participants
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, username, avatar_url')
              .in('id', userIds);

            // Sort: host first, then others
            const profilesWithOrder = (profiles || []).sort((a, b) => {
              if (a.id === session.host_id) return -1;
              if (b.id === session.host_id) return 1;
              return 0;
            });

            return {
              ...session,
              participants: profilesWithOrder.map(p => ({
                user_id: p.id,
                username: p.username,
                avatar_url: p.avatar_url,
              })),
            };
          })
        );

        console.log('Setting group walks with participants:', sessionsWithParticipants);
        setGroupWalks(sessionsWithParticipants);
      }
    } catch (err) {
      console.error('Exception in loadGroupWalks:', err);
    }
  };

  // Reload data when screen comes into focus
  useFocusEffect(useCallback(() => {
    if (isAuthenticated) {
      console.log('Screen focused, reloading data...');
      loadInitialData();
    }
  }, [isAuthenticated]));

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
          <Text style={styles.settingsIcon}>⚙️</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Period Selector */}
        <View style={styles.periodSelector}>
          <TouchableOpacity 
            style={[styles.periodBtn, selectedPeriod === 'week' && styles.periodBtnActive]}
            onPress={() => setSelectedPeriod('week')}
          >
            <Text style={[styles.periodText, selectedPeriod === 'week' && styles.periodTextActive]}>Week</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.periodBtn, selectedPeriod === 'month' && styles.periodBtnActive]}
            onPress={() => setSelectedPeriod('month')}
          >
            <Text style={[styles.periodText, selectedPeriod === 'month' && styles.periodTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.periodBtn, selectedPeriod === 'all' && styles.periodBtnActive]}
            onPress={() => setSelectedPeriod('all')}
          >
            <Text style={[styles.periodText, selectedPeriod === 'all' && styles.periodTextActive]}>All Time</Text>
          </TouchableOpacity>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity 
            style={[styles.statCard, shadow.card]} 
            onPress={() => router.push('/leaderboard')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>
              {selectedPeriod === 'all' && (stats?.total_points || 0)}
              {selectedPeriod === 'month' && monthlyStats.points}
              {selectedPeriod === 'week' && weeklyStats.points}
            </Text>
            <Text style={styles.statLabel}>Points</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.statCard, shadow.card]} 
            onPress={() => router.push('/leaderboard')}
            activeOpacity={0.7}
          >
            <Text style={styles.statNumber}>{stats?.current_streak_days || 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>
              {selectedPeriod === 'all' && (stats?.total_walks || 0)}
              {selectedPeriod === 'month' && monthlyStats.walks}
              {selectedPeriod === 'week' && weeklyStats.walks}
            </Text>
            <Text style={styles.statLabel}>Walks</Text>
          </View>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>
              {selectedPeriod === 'all' && formatDuration(stats?.total_duration_seconds || 0)}
              {selectedPeriod === 'month' && formatDuration(monthlyStats.duration_seconds)}
              {selectedPeriod === 'week' && formatDuration(weeklyStats.duration_seconds)}
            </Text>
            <Text style={styles.statLabel}>Duration</Text>
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
            <Text style={styles.walkIcon}>🚶</Text>
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryCta}
          onPress={() => router.push('/start-group-walk')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnIcon}>👥</Text>
          <Text style={styles.secondaryCtaText}>Start Group Walk</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.secondaryCta} 
          onPress={() => router.push('/friends')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnIcon}>+</Text>
          <Text style={styles.secondaryCtaText}>Find Friends</Text>
        </TouchableOpacity>

        {/* Group Walks */}
        {groupWalks.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>My Group Walks</Text>
            {groupWalks.map(session => (
              <View key={session.id} style={styles.groupWalkCard}>
                <TouchableOpacity
                  style={styles.groupWalkContent}
                  onPress={() => router.push({ pathname: '/walk-timer', params: { sessionId: session.id } })}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1, alignItems: 'center' }}>
                    <Text style={styles.planName}>{session.name || 'Group Walk'}</Text>
                    <Text style={styles.planMeta}>
                      {session.status === 'active' ? '🟢 Active' : session.status === 'completed' ? '✅ Completed' : '📅 Scheduled'} · {new Date(session.created_at).toLocaleDateString()}
                    </Text>
                    {/* Participant Avatars */}
                    {session.participants && session.participants.length > 0 && (
                      <View style={styles.participantsRow}>
                        {session.participants.slice(0, 5).map((participant, idx) => (
                          <View key={participant.user_id} style={[styles.participantAvatar, idx > 0 && { marginLeft: -8 }]}>
                            {participant.avatar_url ? (
                              <Image
                                source={{ uri: participant.avatar_url }}
                                style={styles.participantAvatarImage}
                              />
                            ) : (
                              <View style={styles.participantAvatarPlaceholder}>
                                <Text style={styles.participantAvatarText}>
                                  {participant.username?.charAt(0).toUpperCase() || '?'}
                                </Text>
                              </View>
                            )}
                            {idx === 0 && (
                              <View style={styles.hostBadge}>
                                <Text style={styles.hostBadgeText}>👑</Text>
                              </View>
                            )}
                          </View>
                        ))}
                        {session.participants.length > 5 && (
                          <View style={[styles.participantAvatar, { marginLeft: -8 }]}>
                            <View style={styles.participantAvatarPlaceholder}>
                              <Text style={styles.participantAvatarText}>+{session.participants.length - 5}</Text>
                            </View>
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.inviteBtnWrapper}>
                  <View style={styles.groupWalkActions}>
                    {session.host_id === currentUserId && session.status === 'scheduled' && (
                      <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => router.push({ pathname: '/start-group-walk', params: { editId: session.id } })}
                      >
                        <Text style={styles.editBtnText}>✏️ Edit</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity 
                      style={styles.inviteBtnIntegrated}
                      onPress={async () => {
                        // Get invite token
                        const { data } = await supabase
                          .from('session_invites')
                          .select('token')
                          .eq('session_id', session.id)
                          .single();
                        if (data) {
                          const link = `https://walks.wearesparklab.com/join/${data.token}`;
                          setSelectedSession({ id: session.id, token: data.token, name: session.name || 'Group Walk' });
                          setShareModalVisible(true);
                        }
                      }}
                    >
                      <Text style={styles.inviteBtnTextIntegrated}>📤 Invite Friends</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}
          </>
        )}

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
                // Protect default walk
                if (plan.id === 'default-plan') {
                  if (Platform.OS === 'web') {
                    window.alert('The default walk cannot be deleted.');
                  } else {
                    Alert.alert('Cannot Delete', 'The default walk cannot be deleted.');
                  }
                  return;
                }
                
                if (Platform.OS === 'web') {
                  if (window.confirm(`Remove "${plan.name}"?`)) {
                    (async () => {
                      await removePlan(plan.id);
                      setPlans(await getPlans());
                    })();
                  }
                } else {
                  Alert.alert('Delete', `Remove "${plan.name}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete', style: 'destructive', onPress: async () => {
                        await removePlan(plan.id);
                        setPlans(await getPlans());
                      }
                    },
                  ]);
                }
              }}
              activeOpacity={0.85}
            >
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={styles.planName}>{plan.name}</Text>
                <Text style={styles.planMeta}>
                  {Math.floor(plan.intervals.reduce((s, i) => s + i.minutes * 60 + i.seconds, 0) / 60)} min · {plan.intervals.length} intervals
                </Text>
              </View>
              {plan.id !== 'default-plan' && (
                <TouchableOpacity
                  style={styles.editIconBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    router.push({ pathname: '/create-walk', params: { editId: plan.id } });
                  }}
                >
                  <Ionicons name="pencil" size={18} color={colors.accent} />
                </TouchableOpacity>
              )}
              <Text style={styles.chevronIcon}>›</Text>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity style={styles.createButton} onPress={() => router.push('/create-walk')} activeOpacity={0.85}>
          <Text style={styles.plusIcon}>+</Text>
          <Text style={styles.createText}>Create a New Walk</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Share Modal */}
      <Modal
        visible={shareModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShareModalVisible(false)}
      >
        <View style={styles.shareModalOverlay}>
          <View style={styles.shareModalContent}>
            <View style={styles.shareModalHeader}>
              <Text style={styles.shareModalTitle}>Share Walk Invite</Text>
              <TouchableOpacity onPress={() => setShareModalVisible(false)} style={styles.shareModalClose}>
                <Text style={styles.shareModalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.shareModalScroll}>
              {/* Social Media Options */}
              <Text style={styles.shareSection}>Social Media</Text>
              <View style={styles.socialGrid}>
                <TouchableOpacity 
                  style={styles.socialBtn}
                  onPress={() => {
                    if (selectedSession) {
                      const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                      handleShareSocial('whatsapp', link, selectedSession.name);
                    }
                  }}
                >
                  <View style={styles.socialIcon}>
                    <Image 
                      source={{ uri: '/social/whatsapp.png' }}
                      style={styles.socialIconImage}
                    />
                  </View>
                  <Text style={styles.socialLabel}>WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.socialBtn}
                  onPress={() => {
                    if (selectedSession) {
                      const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                      handleShareSocial('facebook', link, selectedSession.name);
                    }
                  }}
                >
                  <View style={styles.socialIcon}>
                    <Image 
                      source={{ uri: '/social/facebook.png' }}
                      style={styles.socialIconImage}
                    />
                  </View>
                  <Text style={styles.socialLabel}>Facebook</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.socialBtn}
                  onPress={() => {
                    if (selectedSession) {
                      const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                      handleShareSocial('instagram', link, selectedSession.name);
                    }
                  }}
                >
                  <View style={styles.socialIcon}>
                    <Image 
                      source={{ uri: '/social/instagram.png' }}
                      style={styles.socialIconImage}
                    />
                  </View>
                  <Text style={styles.socialLabel}>Instagram</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.socialBtn}
                  onPress={() => {
                    if (selectedSession) {
                      const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                      handleShareSocial('telegram', link, selectedSession.name);
                    }
                  }}
                >
                  <View style={styles.socialIcon}>
                    <Image 
                      source={{ uri: '/social/telegram.png' }}
                      style={styles.socialIconImage}
                    />
                  </View>
                  <Text style={styles.socialLabel}>Telegram</Text>
                </TouchableOpacity>
              </View>

              {/* Friends List */}
              {friends.length > 0 && (
                <>
                  <Text style={styles.shareSection}>Your Friends</Text>
                  {friends.map((friend) => (
                    <TouchableOpacity
                      key={friend.id}
                      style={styles.friendItem}
                      onPress={() => {
                        if (selectedSession) {
                          const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                          handleShareToFriend(friend.id, friend.username, link);
                        }
                      }}
                    >
                      <View style={styles.friendAvatar}>
                        <Text style={styles.friendInitial}>
                          {friend.username.charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.friendName}>{friend.username}</Text>
                      <Text style={styles.friendShareIcon}>📤</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* Copy Link */}
              <Text style={styles.shareSection}>Or Copy Link</Text>
              <TouchableOpacity 
                style={styles.copyLinkBtn}
                onPress={() => {
                  if (selectedSession) {
                    const link = `https://walks.wearesparklab.com/join/${selectedSession.token}`;
                    handleCopyLink(link);
                    setShareModalVisible(false);
                  }
                }}
              >
                <Text style={styles.copyLinkText}>📋 Copy Invite Link</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: Platform.OS === 'web' ? 0 : pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  hero: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 18, paddingHorizontal: Platform.OS === 'web' ? pad.xl : 0, maxWidth: 800, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontSize: 26, fontWeight: '800' },
  subtitle: { color: colors.sub, marginTop: 6 },
  settingsButton: { padding: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  settingsIcon: { fontSize: 20 },
  content: { flex: 1, paddingHorizontal: Platform.OS === 'web' ? pad.xl : 0, maxWidth: 800, width: '100%', alignSelf: 'center' },
  statsRow: { flexDirection: 'row', gap: 16, marginBottom: 24 },
  statCard: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.lg,
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
    backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.lg, borderWidth: 1, borderColor: colors.line,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
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
  chevronIcon: { color: colors.sub, fontSize: 24, fontWeight: '300' },
  plusIcon: { color: colors.accent, fontSize: 24, fontWeight: '600' },
  walkIcon: { fontSize: 22 },
  btnIcon: { fontSize: 18 },
  groupIcon: { color: colors.accent, fontSize: 20 },
  editIconBtn: {
    padding: 6,
    marginLeft: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.accent + '10',
  },
  groupWalkCard: { 
    backgroundColor: colors.card, 
    borderRadius: radius.lg, 
    borderWidth: 1, 
    borderColor: colors.line,
    marginBottom: 16,
    overflow: 'hidden',
  },
  groupWalkContent: {
    padding: pad.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnWrapper: {
    backgroundColor: colors.bg,
    paddingTop: 1,
  },
  groupWalkActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editBtn: {
    flex: 1,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: pad.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: colors.line,
  },
  editBtnText: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: '600',
  },
  inviteBtnIntegrated: { 
    flex: 2,
    backgroundColor: colors.accent + '10', 
    paddingVertical: 12,
    paddingHorizontal: pad.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnTextIntegrated: { 
    color: colors.accent, 
    fontSize: 14, 
    fontWeight: '800',
  },
  inviteBtn: { backgroundColor: colors.accent + '20', borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.accent + '40' },
  inviteBtnText: { color: colors.accent, fontSize: 13, fontWeight: '700' },
  periodSelector: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  periodBtn: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.line },
  periodBtnActive: { backgroundColor: colors.accent + '20', borderColor: colors.accent },
  periodText: { color: colors.sub, fontSize: 14, fontWeight: '600' },
  periodTextActive: { color: colors.accent },
  participantsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  participantAvatar: { width: 32, height: 32, borderRadius: 16, position: 'relative', borderWidth: 2, borderColor: colors.bg },
  participantAvatarImage: { width: '100%', height: '100%', borderRadius: 16 },
  participantAvatarPlaceholder: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: colors.accent + '30', alignItems: 'center', justifyContent: 'center' },
  participantAvatarText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  hostBadge: { position: 'absolute', bottom: -2, right: -2, width: 16, height: 16, borderRadius: 8, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  hostBadgeText: { fontSize: 10 },

  // Share Modal Styles
  shareModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  shareModalContent: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: pad.sm,
    paddingBottom: pad.lg,
    maxHeight: '65%',
  },
  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: pad.md,
    marginBottom: pad.sm,
  },
  shareModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  shareModalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareModalCloseText: {
    fontSize: 20,
    color: colors.text,
    fontWeight: '700',
  },
  shareModalScroll: {
    paddingHorizontal: pad.md,
  },
  shareSection: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    opacity: 0.6,
    marginTop: pad.sm,
    marginBottom: 6,
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: pad.sm,
  },
  socialBtn: {
    width: '47%',
    alignItems: 'center',
    padding: pad.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
  },
  socialIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: pad.xs,
  },
  socialEmoji: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  socialLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: pad.sm,
    backgroundColor: colors.bg,
    borderRadius: radius.sm,
    marginBottom: 6,
  },
  friendAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: pad.sm,
  },
  friendInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  friendName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  friendShareIcon: {
    fontSize: 18,
  },
  copyLinkBtn: {
    padding: 10,
    backgroundColor: colors.accent,
    borderRadius: radius.sm,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: pad.sm,
  },
  copyLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  socialIconImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
});
