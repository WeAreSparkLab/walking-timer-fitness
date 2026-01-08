import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius } from '../lib/theme';
import { supabase } from '../lib/supabaseClient';
import { sendFriendRequest, listMyFriends, listIncomingFriendRequests, respondToFriendRequest } from '../lib/api/friends';
import { useMyProfile } from '../lib/useMyProfile';

export default function Friends() {
  const router = useRouter();
  const { profile } = useMyProfile();
  const [activeTab, setActiveTab] = useState<'friends' | 'search' | 'requests'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadFriends();
    loadRequests();
  }, []);

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
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
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
                <Ionicons name="people-outline" size={64} color={colors.sub} />
                <Text style={styles.emptyText}>No friends yet</Text>
                <Text style={styles.emptySubText}>Search for people to add them</Text>
              </View>
            ) : (
              friends.map((friend) => (
                <View key={friend.id} style={styles.userCard}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(friend.username || friend.email || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{friend.username || 'User'}</Text>
                    {friend.email && <Text style={styles.userEmail}>{friend.email}</Text>}
                  </View>
                  <TouchableOpacity style={styles.userAction}>
                    <Ionicons name="chatbubble-outline" size={20} color={colors.accent} />
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
                <Ionicons name="search" size={20} color={colors.accent} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <Text style={styles.loadingText}>Searching...</Text>
            ) : searchResults.length === 0 && searchQuery ? (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color={colors.sub} />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              searchResults.map((user) => (
                <View key={user.id} style={styles.userCard}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(user.username || user.email || 'U')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.username || 'User'}</Text>
                    {user.email && <Text style={styles.userEmail}>{user.email}</Text>}
                  </View>
                  <TouchableOpacity 
                    onPress={() => handleAddFriend(user.id)}
                    style={styles.addBtn}
                  >
                    <Ionicons name="person-add" size={18} color={colors.text} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {activeTab === 'requests' && (
          <View style={styles.section}>
            {requests.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="mail-outline" size={64} color={colors.sub} />
                <Text style={styles.emptyText}>No pending requests</Text>
              </View>
            ) : (
              requests.map((req) => (
                <View key={req.id} style={styles.requestCard}>
                  <View style={styles.userAvatar}>
                    <Text style={styles.userAvatarText}>
                      {(req.requester?.username || 'U')[0].toUpperCase()}
                    </Text>
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
                      <Ionicons name="checkmark" size={20} color={colors.text} />
                    </TouchableOpacity>
                    <TouchableOpacity 
                      onPress={() => handleRejectRequest(req.id)}
                      style={styles.rejectBtn}
                    >
                      <Ionicons name="close" size={20} color={colors.danger} />
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
  loadingText: {
    color: colors.sub,
    textAlign: 'center',
    padding: 20,
  },
});
