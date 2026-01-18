import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad } from '../../lib/theme';
import { redeemInviteToken } from '../../lib/api/invites';

export default function JoinByToken() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        if (!token) throw new Error('No token');
        const sessionId = await redeemInviteToken(token);
        router.replace({ pathname: '/walk-timer', params: { sessionId } });
      } catch (e: any) {
        setError(e.message ?? 'Could not join session');
        setTimeout(() => router.replace('/dashboard'), 3000);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <View style={styles.container}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      <View style={styles.content}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.text}>Joining session...</Text>
          </>
        ) : error ? (
          <>
            <Text style={styles.errorIcon}>⚠</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={styles.subText}>Redirecting to dashboard...</Text>
          </>
        ) : (
          <>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.text}>Joined! Starting walk...</Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  content: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    paddingHorizontal: pad.lg,
  },
  text: { 
    color: colors.text, 
    fontSize: 18, 
    fontWeight: '600',
    marginTop: 16,
  },
  errorText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
  },
  subText: {
    color: colors.sub,
    fontSize: 14,
    marginTop: 8,
  },
  errorIcon: { fontSize: 64, color: colors.danger },
  successIcon: { fontSize: 64, color: colors.accent, fontWeight: '700' },
});
