import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, Image } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius } from '../../lib/theme';
import { getConversation, sendDirectMessage, subscribeToConversation, markMessagesAsRead } from '../../lib/api/directMessages';
import { useMyProfile } from '../../lib/useMyProfile';
import { notifyDirectMessage } from '../../lib/webNotifications';

export default function DirectChat() {
  const router = useRouter();
  const { friendId, friendName } = useLocalSearchParams<{ friendId: string; friendName?: string }>();
  const { profile } = useMyProfile();
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const scrollViewRef = useRef<any>(null);

  useEffect(() => {
    if (!friendId) return;

    loadMessages();
    markMessagesAsRead(friendId);

    const unsubscribe = subscribeToConversation(friendId, async (message) => {
      setMessages(prev => {
        if (prev.some(m => m.id === message.id)) return prev;
        return [...prev, message];
      });
      
      // Mark as read if it's from the friend
      if (message.sender_id === friendId) {
        markMessagesAsRead(friendId);
        
        // Show notification for new message (only if from friend, not from me)
        if (profile?.id && message.sender_id !== profile.id) {
          const senderName = message.sender?.username || message.sender?.email || 'Someone';
          await notifyDirectMessage(senderName, message.text, friendId);
        }
      }
    });

    return unsubscribe;
  }, [friendId]);

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length]);

  const loadMessages = async () => {
    try {
      const data = await getConversation(friendId);
      setMessages(data);
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const handleSend = async () => {
    if (!messageText.trim()) return;

    const textToSend = messageText.trim();
    setMessageText('');

    try {
      const newMessage = await sendDirectMessage(friendId, textToSend);
      setMessages(prev => {
        if (prev.some(m => m.id === newMessage.id)) return prev;
        return [...prev, newMessage];
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessageText(textToSend);
      if (Platform.OS === 'web') {
        window.alert('Failed to send message');
      }
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.push('/friends')} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{friendName || 'Chat'}</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
      >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((msg, idx) => {
            const isMe = msg.sender_id === profile?.id;
            return (
              <View
                key={msg.id || idx}
                style={[styles.messageRow, isMe && styles.messageRowMe]}
              >
                {!isMe && (
                  <View style={styles.messageAvatar}>
                    {msg.sender?.avatar_url ? (
                      <Image 
                        source={{ uri: msg.sender.avatar_url }} 
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {msg.sender?.username?.charAt(0).toUpperCase() || '?'}
                      </Text>
                    )}
                  </View>
                )}
                <View style={[styles.messageBubble, isMe && styles.messageBubbleMe]}>
                  <Text style={styles.messageText}>{msg.text}</Text>
                  <Text style={styles.messageTime}>
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                {isMe && (
                  <View style={[styles.messageAvatar, styles.messageAvatarMe]}>
                    {profile?.avatarUrl ? (
                      <Image 
                        source={{ uri: profile.avatarUrl }} 
                        style={styles.avatarImage}
                      />
                    ) : (
                      <Text style={styles.avatarText}>
                        {profile?.username?.charAt(0).toUpperCase() || '?'}
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            value={messageText}
            onChangeText={setMessageText}
            placeholder="Type a message..."
            placeholderTextColor={colors.sub}
            style={styles.input}
            multiline
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            onPress={handleSend}
            style={styles.sendBtn}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={[colors.accent, colors.accent2]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.sendGrad}
            >
              <Ionicons name="send" size={20} color={colors.text} />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bgGlow: { position: 'absolute' as any, top: 0, left: 0, right: 0, height: 400, opacity: 0.3 },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pad.md,
    paddingTop: pad.lg,
    paddingBottom: pad.md,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },

  chatContainer: { flex: 1, paddingHorizontal: pad.md },
  messagesList: { flex: 1 },
  messagesContent: { paddingVertical: pad.md },

  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
    gap: 8,
    alignSelf: 'flex-start',
  },
  messageRowMe: {
    flexDirection: 'row-reverse',
    alignSelf: 'flex-end',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accent + '40',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.accent,
    overflow: 'hidden',
  },
  messageAvatarMe: {
    backgroundColor: 'rgba(138,43,226,0.3)',
  },
  avatarImage: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  messageBubble: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    maxWidth: '70%',
    borderWidth: 1,
    borderColor: colors.line,
  },
  messageBubbleMe: {
    backgroundColor: 'rgba(138,43,226,0.15)',
    borderColor: colors.accent,
  },
  messageText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    color: colors.sub,
    fontSize: 10,
    marginTop: 4,
    textAlign: 'right',
  },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingVertical: pad.md,
  },
  input: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: pad.md,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  sendGrad: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
