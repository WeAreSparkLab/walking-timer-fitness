// app/walk-timer.tsx — replaced by /walk (solo) and /together/[id] (group).
// Kept so old links and notification taps still land in the right place.
import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function WalkTimerRedirect() {
  const router = useRouter();
  const { sessionId, planId } = useLocalSearchParams<{ sessionId?: string; planId?: string }>();
  useEffect(() => {
    if (sessionId) router.replace(`/together/${sessionId}`);
    else if (planId) router.replace({ pathname: '/walk', params: { planId: String(planId) } });
    else router.replace('/walk');
  }, [sessionId, planId]);
  return <View style={{ flex: 1, backgroundColor: '#0D1310' }} />;
}