// app/user/[userId].tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, shadow } from '../../lib/theme';
import { supabase } from '../../lib/supabaseClient';
import { 
  getFriendshipStatus, 
  sendFriendRequest, 
  removeFriend, 
  respondToFriendRequest,
  cancelFriendRequest 
} from '../../lib/api/friends';
import { getUserStatsById, getUserLeaderboardPosition, formatDuration } from '../../lib/api/stats';

type UserProfile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  email: string | null;
};

type FriendStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export default function UserProfilePage() {
  const router = useRouter();
  const { userId } = useLocalSearchParams<{ userId: string }>();

  // Smart back navigation: go back if possible, else go to dashboard
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history && window.history.length > 1) {
      router.back();
    } else {
      router.replace('/dashboard');
    }
  };
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [leaderboardPosition, setLeaderboardPosition] = useState<{ rank: number; totalUsers: number } | null>(null);
  const [friendStatus, setFriendStatus] = useState<FriendStatus>('none');
  const [friendshipId, setFriendshipId] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isOwnProfile, setIsOwnProfile] = useState(false);

  useEffect(() => {
    if (userId) {
      loadUserData();
    }
  }, [userId]);

  const loadUserData = async () => {
    setLoading(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUserId(user?.id || null);
      setIsOwnProfile(user?.id === userId);

      // Load profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, email')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Load stats
      const userStats = await getUserStatsById(userId);
      setStats(userStats);

      // Load leaderboard position
      const position = await getUserLeaderboardPosition(userId, 'all');
      setLeaderboardPosition(position);

      // Load friendship status (if logged in and not own profile)
      if (user && user.id !== userId) {
        const { status, friendshipId: fId } = await getFriendshipStatus(userId);
        setFriendStatus(status);
        setFriendshipId(fId);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!userId) return;
    setActionLoading(true);
    try {
      await sendFriendRequest(userId);
      setFriendStatus('pending_sent');
      if (Platform.OS === 'web') {
        window.alert('Friend request sent!');
      } else {
        Alert.alert('Success', 'Friend request sent!');
      }
    } catch (error: any) {
      console.error('Add friend error:', error);
      if (Platform.OS === 'web') {
        window.alert(error.message || 'Failed to send request');
      } else {
        Alert.alert('Error', error.message || 'Failed to send request');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleRemoveFriend = async () => {
    if (!userId) return;
    
    const confirmRemove = Platform.OS === 'web' 
      ? window.confirm(`Remove ${profile?.username || 'this user'} as a friend?`)
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Remove Friend',
            `Remove ${profile?.username || 'this user'} as a friend?`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Remove', style: 'destructive', onPress: () => resolve(true) }
            ]
          );
        });

    if (!confirmRemove) return;

    setActionLoading(true);
    try {
      await removeFriend(userId);
      setFriendStatus('none');
      setFriendshipId(undefined);
    } catch (error) {
      console.error('Remove friend error:', error);
      if (Platform.OS === 'web') {
        window.alert('Failed to remove friend');
      } else {
        Alert.alert('Error', 'Failed to remove friend');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcceptRequest = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    try {
      await respondToFriendRequest(friendshipId, 'accepted');
      setFriendStatus('friends');
      if (Platform.OS === 'web') {
        window.alert('Friend request accepted!');
      } else {
        Alert.alert('Success', 'Friend request accepted!');
      }
    } catch (error) {
      console.error('Accept error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelRequest = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    try {
      await cancelFriendRequest(friendshipId);
      setFriendStatus('none');
      setFriendshipId(undefined);
    } catch (error) {
      console.error('Cancel error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectRequest = async () => {
    if (!friendshipId) return;
    setActionLoading(true);
    try {
      await respondToFriendRequest(friendshipId, 'blocked');
      setFriendStatus('none');
      setFriendshipId(undefined);
    } catch (error) {
      console.error('Reject error:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const renderFriendButton = () => {
    if (isOwnProfile) {
      return (
        <TouchableOpacity 
          style={styles.editProfileBtn}
          onPress={() => router.push('/profile')}
        >
          <Ionicons name="settings-outline" size={18} color={colors.text} />
          <Text style={styles.editProfileBtnText}>Edit Profile</Text>
        </TouchableOpacity>
      );
    }

    if (!currentUserId) {
      return (
        <TouchableOpacity 
          style={styles.loginBtn}
          onPress={() => router.push('/')}
        >
          <Text style={styles.loginBtnText}>Log in to connect</Text>
        </TouchableOpacity>
      );
    }

    if (actionLoading) {
      return (
        <View style={styles.actionBtn}>
          <ActivityIndicator size="small" color={colors.text} />
        </View>
      );
    }

    switch (friendStatus) {
      case 'friends':
        return (
          <View style={styles.friendsBadgeBtn}>
            <Ionicons name="people" size={18} color={colors.accent} />
            <Text style={styles.friendsBadgeBtnText}>Friends</Text>
          </View>
        );
      
      case 'pending_sent':
        return (
          <TouchableOpacity 
            style={styles.pendingBtn}
            onPress={handleCancelRequest}
          >
            <Ionicons name="time-outline" size={18} color={colors.sub} />
            <Text style={styles.pendingBtnText}>Request Sent</Text>
          </TouchableOpacity>
        );
      
      case 'pending_received':
        return (
          <View style={styles.requestActions}>
            <TouchableOpacity 
              style={styles.acceptBtn}
              onPress={handleAcceptRequest}
            >
              <Ionicons name="checkmark" size={18} color={colors.bg} />
              <Text style={styles.acceptBtnText}>Accept</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.rejectBtn}
              onPress={handleRejectRequest}
            >
              <Ionicons name="close" size={18} color={colors.sub} />
            </TouchableOpacity>
          </View>
        );
      
      default:
        return (
          <TouchableOpacity 
            style={styles.addFriendBtn}
            onPress={handleAddFriend}
          >
            <Ionicons name="person-add-outline" size={18} color={colors.bg} />
            <Text style={styles.addFriendBtnText}>Add Friend</Text>
          </TouchableOpacity>
        );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.errorText}>User not found</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.25)', 'rgba(0,234,255,0.10)']} style={styles.bgGlow} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerBackBtn} onPress={handleBack}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, shadow.card]}>
          <View style={styles.avatarContainer}>
            {profile.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {profile.username?.charAt(0).toUpperCase() || '?'}
                </Text>
              </View>
            )}
            {friendStatus === 'friends' && (
              <View style={styles.friendBadge}>
                <Ionicons name="people" size={12} color={colors.bg} />
              </View>
            )}
          </View>
          
          <Text style={styles.username}>{profile.username || 'User'}</Text>
          
          {leaderboardPosition && (
            <View style={styles.rankBadge}>
              <Text style={styles.rankText}>
                #{leaderboardPosition.rank} of {leaderboardPosition.totalUsers}
              </Text>
            </View>
          )}

          {/* Friend Action Button */}
          <View style={styles.actionContainer}>
            {renderFriendButton()}
          </View>
        </View>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsGrid}>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>{stats?.total_points || 0}</Text>
            <Text style={styles.statLabel}>Points</Text>
          </View>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>{stats?.total_walks || 0}</Text>
            <Text style={styles.statLabel}>Walks</Text>
          </View>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>{formatDuration(stats?.total_duration_seconds || 0)}</Text>
            <Text style={styles.statLabel}>Total Time</Text>
          </View>
          <View style={[styles.statCard, shadow.card]}>
            <Text style={styles.statNumber}>{stats?.current_streak_days || 0}</Text>
            <Text style={styles.statLabel}>Day Streak</Text>
          </View>
        </View>

        {/* If friends, show message option */}
        {friendStatus === 'friends' && userId && (
          <TouchableOpacity 
            style={styles.messageBtn}
            onPress={() => router.push({ pathname: '/chat/[friendId]' as any, params: { friendId: userId } })}
          >
            <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
            <Text style={styles.messageBtnText}>Send Message</Text>
          </TouchableOpacity>
        )}

        {/* Remove friend option at bottom */}
        {friendStatus === 'friends' && !actionLoading && (
          <TouchableOpacity 
            style={styles.removeFriendLink}
            onPress={handleRemoveFriend}
          >
            <Text style={styles.removeFriendLinkText}>Remove Friend</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  bgGlow: {
    position: 'absolute',
    width: '120%',
    height: '120%',
    borderRadius: 999,
    left: -40,
    top: -60,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pad.lg,
    paddingTop: pad.xl,
    paddingBottom: pad.md,
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: pad.lg,
  },
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: pad.xl,
    alignItems: 'center',
    marginBottom: pad.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: pad.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.accent + '30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.accent,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.accent,
  },
  friendBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.card,
  },
  username: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  rankBadge: {
    backgroundColor: colors.accent + '20',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: radius.md,
    marginBottom: pad.md,
  },
  rankText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  actionContainer: {
    marginTop: pad.sm,
    width: '100%',
    alignItems: 'center',
  },
  addFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
  },
  addFriendBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  friendsBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent + '20',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  friendsBadgeBtnText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  removeFriendLink: {
    marginTop: pad.lg,
    paddingVertical: 12,
    alignItems: 'center',
  },
  removeFriendLinkText: {
    color: colors.sub,
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  removeFriendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.danger + '20',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.danger + '40',
  },
  removeFriendBtnText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  pendingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pendingBtnText: {
    color: colors.sub,
    fontSize: 15,
    fontWeight: '600',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 12,
  },
  acceptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: radius.lg,
  },
  acceptBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
  rejectBtn: {
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editProfileBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  editProfileBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  loginBtn: {
    backgroundColor: colors.accent + '20',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '40',
  },
  loginBtnText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  actionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: pad.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: pad.lg,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: pad.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.sub,
    marginTop: 4,
  },
  messageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: colors.accent + '15',
    paddingVertical: 14,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  messageBtnText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: colors.sub,
    fontSize: 16,
    marginBottom: pad.md,
  },
  backBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.lg,
  },
  backBtnText: {
    color: colors.bg,
    fontSize: 15,
    fontWeight: '700',
  },
});
