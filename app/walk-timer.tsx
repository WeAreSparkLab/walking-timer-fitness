import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Alert, ScrollView, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, paceColors } from '../lib/theme';
import { getPlanById, removePlan, Pace } from '../lib/storage';
import { 
  updateProgress, 
  getSessionProgress, 
  subscribeToProgress,
  SessionProgress,
  getSession 
} from '../lib/api/sessions';
import { sendMessage, subscribeMessages } from '../lib/api/messages';
import { useMyProfile } from '../lib/useMyProfile';

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

// Sound generator for pace changes
const playBeep = async (duration: number) => {
  if (Platform.OS === 'web') {
    // Use Web Audio API
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // 800 Hz tone
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
  } else {
    // For native, use expo-av to generate a tone
    try {
      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=' },
        { shouldPlay: true, volume: 0.3 }
      );
      setTimeout(() => sound.unloadAsync(), duration * 1000);
    } catch (error) {
      console.log('Audio error:', error);
    }
  }
};

const playPaceSound = async (pace: Pace) => {
  if (pace === 'WARMUP' || pace === 'COOLDOWN') {
    // Long beep (500ms)
    await playBeep(0.5);
  } else if (pace === 'SLOW') {
    // One short beep (150ms)
    await playBeep(0.15);
  } else if (pace === 'FAST') {
    // Two short beeps
    await playBeep(0.15);
    setTimeout(() => playBeep(0.15), 200);
  }
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
  const { planId, sessionId } = useLocalSearchParams<{ planId?: string; sessionId?: string }>();

  const [intervals, setIntervals] = useState<Interval[]>([]);
  const [ready, setReady] = useState(false);
  const [totalTime, setTotalTime] = useState(0);
  const [currentInterval, setCurrentInterval] = useState(0);
  const [intervalTime, setIntervalTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [currentPace, setCurrentPace] = useState<Pace>('WARMUP');
  const [participantsProgress, setParticipantsProgress] = useState<SessionProgress[]>([]);
  const [sessionName, setSessionName] = useState<string | null>(null);
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const { profile } = useMyProfile();
  const intervalRef = useRef<any>(null);

  // Load plan or default (now includes warmup/cooldown)
  useEffect(() => {
    (async () => {
      // If session ID, load from session
      if (sessionId) {
        try {
          const sid = typeof sessionId === 'string' ? sessionId : sessionId[0];
          const session = await getSession(sid);
          setSessionName(session.name);
          const ivs = (session.plan as any[]).map((i: any) => ({ 
            pace: i.pace as Pace, 
            duration: i.minutes * 60 + i.seconds 
          }));
          setIntervals(ivs);
          setReady(true);
          
          // Load initial progress
          const progress = await getSessionProgress(sid);
          setParticipantsProgress(progress);
          return;
        } catch (error) {
          console.error('Failed to load session:', error);
        }
      }
      
      // Otherwise load from planId or default
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
        { pace: 'FAST', duration: 180 },
        { pace: 'SLOW', duration: 180 },
        { pace: 'FAST', duration: 180 },
        { pace: 'SLOW', duration: 180 },
        { pace: 'FAST', duration: 180 },
        { pace: 'COOLDOWN', duration: 180 },
      ]);
      setReady(true);
    })();
  }, [planId, sessionId]);

  // Subscribe to real-time progress updates for group walks
  useEffect(() => {
    if (!sessionId) return;
    
    const sid = typeof sessionId === 'string' ? sessionId : sessionId[0];
    const unsubscribe = subscribeToProgress(sid, (progress) => {
      setParticipantsProgress(progress);
    });
    
    return unsubscribe;
  }, [sessionId]);

  // Subscribe to chat messages
  useEffect(() => {
    if (!sessionId) return;
    
    const sid = typeof sessionId === 'string' ? sessionId : sessionId[0];
    const unsubscribe = subscribeMessages(sid, (message) => {
      setMessages(prev => [...prev, message]);
    });
    
    return unsubscribe;
  }, [sessionId]);

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
              playPaceSound(nextIv.pace); // Play sound for pace change
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

  // Broadcast progress to session participants
  useEffect(() => {
    if (!sessionId || !isRunning) return;
    
    const sid = typeof sessionId === 'string' ? sessionId : sessionId[0];
    const broadcastInterval = setInterval(() => {
      updateProgress(sid, currentInterval, intervalTime, !isRunning).catch(console.error);
    }, 2000); // Update every 2 seconds
    
    return () => clearInterval(broadcastInterval);
  }, [sessionId, isRunning, currentInterval, intervalTime]);

  const resetTimer = () => {
    setIsRunning(false);
    const total = intervals.reduce((s, i) => s + i.duration, 0);
    setTotalTime(total);
    setCurrentInterval(0);
    setIntervalTime(intervals[0]?.duration ?? 0);
    setCurrentPace(intervals[0]?.pace ?? 'WARMUP');
    safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleDelete = async () => {
    if (!planId) {
      console.log('No planId found');
      return;
    }
    
    const idToDelete = typeof planId === 'string' ? planId : planId[0];
    console.log('Attempting to delete:', idToDelete);
    
    const confirmed = Platform.OS === 'web' 
      ? window.confirm('Are you sure you want to delete this walk plan?')
      : await new Promise<boolean>(resolve => {
          Alert.alert(
            'Delete Walk',
            'Are you sure you want to delete this walk plan?',
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
            ]
          );
        });
    
    if (confirmed) {
      console.log('Delete confirmed');
      try {
        await removePlan(idToDelete);
        console.log('Plan removed, navigating to dashboard');
        router.replace('/dashboard');
      } catch (error) {
        console.error('Delete error:', error);
      }
    }
  };

  const handleEdit = () => {
    if (planId) {
      router.push(`/create-walk?editId=${planId}`);
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !sessionId) return;
    
    const sid = typeof sessionId === 'string' ? sessionId : sessionId[0];
    try {
      await sendMessage(sid, messageText.trim());
      setMessageText('');
    } catch (error) {
      console.error('Failed to send message:', error);
    }
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
        <Text style={styles.headerTitle}>{sessionName || 'Walk Timer'}</Text>
        {planId ? (
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleEdit} style={styles.iconBtn}>
              <Ionicons name="create-outline" size={20} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={[styles.iconBtn, { marginLeft: 8 }]}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      {/* Group walk participants */}
      {sessionId && participantsProgress.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.participantsScroll}>
          {participantsProgress.map((p) => {
            const paceColor = intervals[p.current_interval]?.pace 
              ? paceColors[intervals[p.current_interval].pace]
              : paceColors.WARMUP;
            return (
              <View key={p.user_id} style={styles.participantCard}>
                <View style={[styles.participantAvatar, { borderColor: paceColor.border }]}>
                  <Text style={styles.participantInitial}>
                    {(p.profile?.username || 'U')[0].toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.participantName} numberOfLines={1}>
                  {p.profile?.username || 'User'}
                </Text>
                <Text style={[styles.participantPace, { color: paceColor.fg }]}>
                  {intervals[p.current_interval]?.pace || 'WARMUP'}
                </Text>
                <Text style={styles.participantTime}>
                  {fmt(p.interval_time_remaining)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

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

      {/* All intervals list */}
      <View style={styles.intervalsList}>
        {intervals.map((interval, idx) => {
          if (idx === currentInterval) return null; // Skip current interval
          
          const isPast = idx < currentInterval;
          const paceColor = paceColors[interval.pace];
          
          return (
            <View
              key={idx}
              style={[
                styles.intervalRow,
                { 
                  backgroundColor: isPast ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)',
                  borderColor: 'rgba(255,255,255,0.08)',
                  opacity: isPast ? 0.5 : 1,
                }
              ]}
            >
              <Text style={[
                styles.intervalLabel,
                { color: colors.sub }
              ]}>
                {isPast ? 'Done:' : 'Next:'}
              </Text>
              <View
                style={[
                  styles.intervalBadge,
                  { 
                    borderColor: 'rgba(255,255,255,0.12)',
                    backgroundColor: 'rgba(255,255,255,0.04)',
                  }
                ]}
              >
                <Text style={[
                  styles.intervalPaceText,
                  { color: isPast ? colors.sub : colors.text }
                ]}>
                  {interval.pace}
                </Text>
                <Text style={[
                  styles.intervalDurationText,
                  { color: colors.sub }
                ]}>
                  {fmt(interval.duration)}
                </Text>
              </View>
            </View>
          );
        })}
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

      {/* Chat Button (only for group walks) */}
      {sessionId && (
        <TouchableOpacity 
          style={styles.chatFab}
          onPress={() => setChatVisible(true)}
          activeOpacity={0.9}
        >
          <LinearGradient 
            colors={[colors.accent, colors.accent2]} 
            start={{ x: 0, y: 0.5 }} 
            end={{ x: 1, y: 0.5 }} 
            style={styles.chatFabGrad}
          >
            <Ionicons name="chatbubbles" size={24} color={colors.text} />
            {messages.length > 0 && (
              <View style={styles.chatBadge}>
                <Text style={styles.chatBadgeText}>{messages.length}</Text>
              </View>
            )}
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* Chat Modal */}
      <Modal
        visible={chatVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setChatVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.chatModal}
        >
          <View style={styles.chatContainer}>
            <View style={styles.chatHeader}>
              <Text style={styles.chatTitle}>Group Chat</Text>
              <TouchableOpacity onPress={() => setChatVisible(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.messagesList}>
              {messages.map((msg, idx) => {
                const isMe = msg.sender_id === profile?.id;
                return (
                  <View 
                    key={msg.id || idx} 
                    style={[styles.messageBubble, isMe && styles.messageBubbleMe]}
                  >
                    {!isMe && <Text style={styles.messageSender}>{msg.sender?.username || 'User'}</Text>}
                    <Text style={styles.messageText}>{msg.text}</Text>
                    <Text style={styles.messageTime}>
                      {new Date(msg.created_at).toLocaleTimeString()}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.messageInput}>
              <TextInput
                value={messageText}
                onChangeText={setMessageText}
                placeholder="Type a message..."
                placeholderTextColor={colors.sub}
                style={styles.messageTextInput}
                multiline
              />
              <TouchableOpacity 
                onPress={handleSendMessage}
                style={styles.sendBtn}
                activeOpacity={0.7}
              >
                <Ionicons name="send" size={20} color={colors.accent} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  header: { paddingTop: 56, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  participantsScroll: {
    marginTop: 12,
    maxHeight: 100,
  },
  participantCard: {
    alignItems: 'center',
    marginRight: 16,
    width: 70,
  },
  participantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    borderWidth: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  participantInitial: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  participantName: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  participantPace: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  participantTime: {
    color: colors.sub,
    fontSize: 10,
    fontWeight: '600',
  },

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

  intervalsList: {
    marginTop: 16,
    gap: 8,
  },
  intervalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  intervalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  intervalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
  },
  intervalPaceText: {
    fontWeight: '700',
    letterSpacing: 0.5,
    fontSize: 13,
  },
  intervalDurationText: {
    fontSize: 12,
    fontWeight: '600',
    opacity: 0.8,
  },

  // Chat styles
  chatFab: {
    position: 'absolute',
    right: pad.lg,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 999,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  chatFabGrad: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.danger,
    borderRadius: 999,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  chatBadgeText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  chatModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  chatContainer: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    maxHeight: '70%',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: pad.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  chatTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  messagesList: {
    padding: pad.lg,
    maxHeight: 400,
  },
  messageBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 8,
    maxWidth: '75%',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.line,
  },
  messageBubbleMe: {
    backgroundColor: 'rgba(138,43,226,0.15)',
    alignSelf: 'flex-end',
    borderColor: colors.accent,
  },
  messageSender: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
  },
  messageText: {
    color: colors.text,
    fontSize: 14,
  },
  messageTime: {
    color: colors.sub,
    fontSize: 10,
    marginTop: 4,
  },
  messageInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: pad.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    gap: 12,
  },
  messageTextInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.md,
    padding: 12,
    color: colors.text,
    maxHeight: 100,
  },
  sendBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: 'rgba(138,43,226,0.15)',
    borderWidth: 1,
    borderColor: colors.accent,
  },
});

