import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Share, Platform, Modal } from 'react-native';
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
  const [shareModalVisible, setShareModalVisible] = useState(false);

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
      const link = `https://walks.wearesparklab.com/join/${token}`;
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
    setShareModalVisible(true);
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;
    
    if (Platform.OS === 'web') {
      try {
        await navigator.clipboard.writeText(inviteLink);
        window.alert('Link copied to clipboard!');
      } catch (error) {
        window.alert('Failed to copy link');
      }
    } else {
      try {
        await Share.share({ message: inviteLink });
      } catch (error) {
        console.error('Copy error:', error);
      }
    }
  };

  const handleShareSocial = (platform: string) => {
    if (!inviteLink) return;
    
    const message = encodeURIComponent(`Join my walk on Spark Walk! ${inviteLink}`);
    let url = '';
    
    switch (platform) {
      case 'whatsapp':
        url = `https://wa.me/?text=${message}`;
        break;
      case 'facebook':
        url = `https://www.facebook.com/dialog/send?link=${encodeURIComponent(inviteLink)}&app_id=0&redirect_uri=${encodeURIComponent(window.location.href)}`;
        break;
      case 'instagram':
        // Instagram doesn't support URL-based sharing on web, so copy and notify
        handleCopyLink();
        window.alert('Link copied! Open Instagram and paste it in a message.');
        return;
      case 'telegram':
        url = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent('Join my walk on Spark Walk!')}`;
        break;
    }
    
    if (Platform.OS === 'web') {
      window.open(url, '_blank');
    }
  };

  const handleShareToFriend = async (friendId: string, friendName: string) => {
    // For now, just copy the link when clicking a friend
    // In the future, this could send a direct notification
    await handleCopyLink();
    if (Platform.OS === 'web') {
      window.alert(`Link copied! Share it with ${friendName}`);
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
            <Text style={styles.iconText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Ready to Walk!</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.content}>
          <View style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>{sessionName}</Text>
            <Text style={styles.successSub}>Session created successfully</Text>
          </View>

          <View style={styles.inviteSection}>
            <Text style={styles.label}>Invite Friends</Text>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} numberOfLines={1}>{inviteLink}</Text>
            </View>
            
            <TouchableOpacity onPress={handleCopyLink} style={styles.copyBtn} activeOpacity={0.85}>
              <Text style={styles.copyIcon}>📋</Text>
              <Text style={styles.copyBtnText}>Copy Link</Text>
            </TouchableOpacity>
            
            <TouchableOpacity onPress={handleShareInvite} style={styles.shareBtn} activeOpacity={0.85}>
              <Text style={styles.shareIcon}>↗</Text>
              <Text style={styles.shareBtnText}>More Share Options</Text>
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
                    onPress={() => handleShareSocial('whatsapp')}
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
                    onPress={() => handleShareSocial('facebook')}
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
                    onPress={() => handleShareSocial('instagram')}
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
                    onPress={() => handleShareSocial('telegram')}
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
                        onPress={() => handleShareToFriend(friend.id, friend.username || 'Friend')}
                      >
                        <View style={styles.friendAvatar}>
                          <Text style={styles.friendInitial}>
                            {(friend.username || 'U')[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text style={styles.friendName}>{friend.username || 'User'}</Text>
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
                    handleCopyLink();
                    setShareModalVisible(false);
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

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.replace('/dashboard')} style={styles.iconBtn}>
          <Text style={styles.iconText}>←</Text>
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
  iconText: { color: colors.text, fontSize: 20 },
  successIcon: { color: colors.accent, fontSize: 64, fontWeight: '700' },
  shareIcon: { color: colors.accent, fontSize: 18 },

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
    paddingTop: pad.lg,
    paddingBottom: 40,
    maxHeight: '80%',
  },

  shareModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: pad.lg,
    marginBottom: pad.md,
  },

  shareModalTitle: {
    fontSize: 20,
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
    paddingHorizontal: pad.lg,
  },

  shareSection: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    opacity: 0.6,
    marginTop: pad.lg,
    marginBottom: pad.md,
  },

  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: pad.md,
  },

  socialBtn: {
    width: '47%',
    alignItems: 'center',
    padding: pad.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
  },

  socialIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: pad.sm,
  },

  socialEmoji: {
    fontSize: 28,
    color: '#FFFFFF',
    fontWeight: '700',
  },

  socialLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },

  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: pad.md,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    marginBottom: pad.sm,
  },

  friendAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: pad.md,
  },

  friendInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },

  friendName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },

  friendShareIcon: {
    fontSize: 20,
  },

  copyLinkBtn: {
    padding: pad.md,
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: pad.sm,
  },

  copyLinkText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },

  socialIconImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
});
