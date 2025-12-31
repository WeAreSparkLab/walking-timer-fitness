import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, Alert } from 'react-native';
import { redeemInviteToken } from '../../lib/api/invites';

export default function JoinByToken() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (!token) throw new Error('No token');
        const sessionId = await redeemInviteToken(token);
        router.replace({ pathname: '/walk-timer', params: { sessionId } });
      } catch (e: any) {
        Alert.alert('Invite error', e.message ?? 'Could not join session.');
        router.replace('/dashboard');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      {loading ? <ActivityIndicator /> : <Text>Redirecting…</Text>}
    </View>
  );
}
