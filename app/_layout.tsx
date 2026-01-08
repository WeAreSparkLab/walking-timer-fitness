import { Stack, useRouter } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';
import { useEffect } from 'react';
import { addNotificationResponseListener } from '../lib/notifications';
import type { NotificationResponse } from 'expo-notifications';

export default function RootLayout() {
  const router = useRouter();

  // Handle notification taps
  useEffect(() => {
    const subscription = addNotificationResponseListener((response: NotificationResponse) => {
      const data = response.notification.request.content.data;
      
      // Navigate based on notification type
      if (data?.type === 'session_invite' && data?.sessionId) {
        router.push(`/walk-timer?sessionId=${data.sessionId}`);
      } else if (data?.type === 'friend_request') {
        router.push('/friends?tab=requests');
      } else if (data?.type === 'friend_accepted') {
        router.push('/friends');
      } else if (data?.type === 'chat_message' && data?.sessionId) {
        router.push(`/walk-timer?sessionId=${data.sessionId}`);
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="dashboard" />
        <Stack.Screen name="walk-timer" />
        <Stack.Screen name="create-walk" />
        <Stack.Screen name="profile" />
      </Stack>
    </>
  );
}
