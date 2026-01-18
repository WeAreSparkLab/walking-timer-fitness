import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius } from '../lib/theme';
import { supabase } from '../lib/supabaseClient';
import { sendFriendRequest, listMyFriends, listIncomingFriendRequests, respondToFriendRequest } from '../lib/api/friends';
import { useMyProfile } from '../lib/useMyProfile';
import { notifyFriendRequest } from '../lib/webNotifications';

export default function Friends() {
  const router = useRouter();
  const { profile } = useMyProfile();
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFriends();
    loadRequests();
    loadSentRequests();
  }, []);

  // Subscribe to incoming friend requests for real-time notifications
  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel('friend-requests')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'friendships',
          filter: `addressee_id=eq.${profile.id}`,
        },
        async (payload) => {
          console.log('New friend request received:', payload);
          
          // Reload requests to show in UI
          loadRequests();
          
          // Get requester's profile for notification
          const { data: requesterProfile } = await supabase
            .from('profiles')
            .select('username, email')
            .eq('id', payload.new.requester_id)
            .single();
          
          if (requesterProfile) {
            const username = requesterProfile.username || requesterProfile.email || 'Someone';
            await notifyFriendRequest(username);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  const loadFriends = async () => {
    try {
      const data = await listMyFriends();
      setFriends(data);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const loadRequests = async () => {
    try {
      const data = await listIncomingFriendRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load requests:', error);
    }
  };

  const loadSentRequests = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', user.id)
        .eq('status', 'pending');
      
      if (error) throw error;
      
      const addresseeIds = new Set(data?.map(f => f.addressee_id) || []);
      setSentRequests(addresseeIds);
    } catch (error) {
      console.error('Failed to load sent requests:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, email')
        .or(`username.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`)
        .neq('id', profile?.id)
        .limit(20);
      
      if (error) throw error;
      setSearchResults(data || []);
    } catch (error) {
      console.error('Search error:', error);
      Alert.alert('Error', 'Failed to search users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async (userId: string) => {
    try {
      await sendFriendRequest(userId);
      setSentRequests(prev => new Set([...prev, userId]));
      Alert.alert('Success', 'Friend request sent!');
    } catch (error: any) {
      console.error('Add friend error:', error);
      Alert.alert('Error', error.message || 'Failed to send request');
    }
  };

  const handleAcceptRequest = async (friendshipId: string) => {
    try {
      await respondToFriendRequest(friendshipId, 'accepted');
      loadFriends();
      loadRequests();
      Alert.alert('Success', 'Friend request accepted!');
    } catch (error) {
      console.error('Accept error:', error);
      Alert.alert('Error', 'Failed to accept request');
    }
  };

  const handleRejectRequest = async (friendshipId: string) => {
    try {
      await respondToFriendRequest(friendshipId, 'blocked');
      loadRequests();
    } catch (error) {
      console.error('Reject error:', error);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/dashboard')} style={styles.iconBtn}>
          <Text style={styles.iconText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Friends</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity 
          onPress={() => setActiveTab('friends')}
          style={[styles.tab, activeTab === 'friends' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'friends' && styles.tabTextActive]}>
            My Friends
          </Text>
          {friends.length > 0 && (
            <View style={styles.tabBadge}>
              <Text style={styles.tabBadgeText}>{friends.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setActiveTab('search')}
          style={[styles.tab, activeTab === 'search' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'search' && styles.tabTextActive]}>
            Find People
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          onPress={() => setActiveTab('requests')}
          style={[styles.tab, activeTab === 'requests' && styles.tabActive]}
        >
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            Requests
          </Text>
          {requests.length > 0 && (
            <View style={[styles.tabBadge, styles.tabBadgeAccent]}>
              <Text style={styles.tabBadgeText}>{requests.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 40 }}>
        {activeTab === 'friends' && (
          <View style={styles.section}>
            {friends.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>👥</Text>
                <Text style={styles.emptyText}>No friends yet</Text>
                <Text style={styles.emptySubText}>Search for people to add them</Text>
              </View>
            ) : (
              friends.map((friend) => (
                <View key={friend.id} style={styles.userCard}>
                  <View style={styles.userAvatar}>
                    {friend.avatar_url ? (
                      <Image source={{ uri: friend.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.userAvatarText}>
                        {(friend.username || friend.email || 'U')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{friend.username || 'User'}</Text>
                    {friend.email && <Text style={styles.userEmail}>{friend.email}</Text>}
                  </View>
                  <TouchableOpacity 
                    style={styles.userAction}
                    onPress={() => router.push({ 
                      pathname: '/chat/[friendId]', 
                      params: { friendId: friend.id, friendName: friend.username || 'User' } 
                    })}
                  >
                    <Text style={styles.chatIcon}>💬</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'search' && (
          <View style={styles.section}>
            <View style={styles.searchBox}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search by username or email..."
                placeholderTextColor={colors.sub}
                style={styles.searchInput}
                onSubmitEditing={handleSearch}
              />
              <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
                <Text style={styles.searchIcon}>🔍</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Searching...</Text>
            ) : searchResults.length === 0 && searchQuery ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              searchResults
                .filter(user => {
                  // Filter out existing friends
                  const isFriend = friends.some(f => f.id === user.id);
                  return !isFriend;
                })
                .map((user) => {
                  const isPending = sentRequests.has(user.id);
                  return (
                    <View key={user.id} style={styles.userCard}>
                      <View style={styles.userAvatar}>
                        {user.avatar_url ? (
                          <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
                        ) : (
                          <Text style={styles.userAvatarText}>
                            {(user.username || user.email || 'U')[0].toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userName}>{user.username || 'User'}</Text>
                        {user.email && <Text style={styles.userEmail}>{user.email}</Text>}
                        {isPending && <Text style={styles.pendingText}>Request Pending</Text>}
                      </View>
                      <TouchableOpacity 
                        onPress={() => !isPending && handleAddFriend(user.id)}
                        style={[styles.addBtn, isPending && styles.addBtnDisabled]}
                        disabled={isPending}
                      >
                        <Text style={styles.addIcon}>{isPending ? '⏳' : '+'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
            )}
          </View>
        )}

        {activeTab === 'requests' && (
          <View style={styles.section}>
            {requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📬</Text>
                <Text style={styles.emptyText}>No pending requests</Text>
              </View>
            ) : (
              requests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.userAvatar}>
                    {req.requester?.avatar_url ? (
                      <Image source={{ uri: req.requester.avatar_url }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.userAvatarText}>
                        {(req.requester?.username || 'U')[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{req.requester?.username || 'User'}</Text>
                    <Text style={styles.requestTime}>
                      {new Date(req.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.requestActions}>
                    <TouchableOpacity 
                      onPress={() => handleAcceptRequest(req.id)}
                      style={styles.acceptBtn}
                    >
                      <Text style={styles.checkIcon}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleRejectRequest(req.id)}
                      style={styles.rejectBtn}
                    >
                      <Text style={[styles.checkIcon, { color: colors.danger }]}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </View>
        )}
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

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: pad.lg,
    gap: 8,
    marginTop: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(138,43,226,0.15)',
    borderColor: colors.accent,
  },
  tabText: {
    color: colors.sub,
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: colors.text,
  },
  tabBadge: {
    backgroundColor: colors.sub,
    borderRadius: 999,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeAccent: {
    backgroundColor: colors.accent,
  },
  tabBadgeText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },

  content: {
    flex: 1,
    paddingHorizontal: pad.lg,
    marginTop: 16,
  },

  section: {
    gap: 8,
  },

  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: 14,
    height: 46,
    color: colors.text,
  },
  searchBtn: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(138,43,226,0.15)',
    borderWidth: 1,
    borderColor: colors.accent,
  },

  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: pad.md,
    gap: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(138,43,226,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 999,
  },
  userAvatarText: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  userEmail: {
    color: colors.sub,
    fontSize: 12,
    marginTop: 2,
  },
  userAction: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  addBtnDisabled: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    opacity: 0.5,
  },
  pendingText: {
    color: colors.accent,
    fontSize: 11,
    marginTop: 2,
    fontStyle: 'italic',
  },

  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: pad.md,
    gap: 12,
  },
  requestTime: {
    color: colors.sub,
    fontSize: 11,
    marginTop: 2,
  },
  requestActions: {
    flexDirection: 'row',
    gap: 8,
  },
  acceptBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
  },
  rejectBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.danger,
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyIcon: { fontSize: 64, opacity: 0.6 },
  emptyText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubText: {
    color: colors.sub,
    fontSize: 14,
    marginTop: 4,
  },
  iconText: { color: colors.text, fontSize: 20 },
  chatIcon: { color: colors.accent, fontSize: 20 },
  searchIcon: { color: colors.accent, fontSize: 20 },
  addIcon: { color: colors.text, fontSize: 18, fontWeight: '600' },
  checkIcon: { color: colors.text, fontSize: 20 },
  loadingText: {
    color: colors.sub,
    textAlign: 'center',
    padding: 20,
  },
});
