import { Stack, useRouter } from "expo-router";
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';
import { useEffect } from 'react';
import { addNotificationResponseListener } from '../lib/notifications';
import type { NotificationResponse } from 'expo-notifications';
import InstallPrompt from '../lib/InstallPrompt';
import { Platform } from 'react-native';
import { requestNotificationPermission } from '../lib/webNotifications';

export default function RootLayout() {
  const router = useRouter();

  // Register service worker for PWA
  useEffect(() => {
    if (Platform.OS === 'web' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  // Request notification permission after first user interaction
  useEffect(() => {
    if (Platform.OS === 'web') {
      const requestPermission = async () => {
        // Wait a bit for user to interact with the app first
        setTimeout(async () => {
          const granted = await requestNotificationPermission();
          if (granted) {
            console.log('Notification permission granted');
          }
        }, 3000);
      };
      requestPermission();
    }
  }, []);

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
      <InstallPrompt />
    </>
  );
}
