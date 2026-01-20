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

  // Inject manifest link into document head
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Add manifest link
      const manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      manifestLink.href = '/manifest.webmanifest';
      document.head.appendChild(manifestLink);
      
      // Add theme color
      const themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      themeColor.content = '#8A2BE2';
      document.head.appendChild(themeColor);
      
      // Add apple touch icon
      const appleIcon = document.createElement('link');
      appleIcon.rel = 'apple-touch-icon';
      appleIcon.href = '/icon-192.png';
      document.head.appendChild(appleIcon);
      
      console.log('✅ Manifest link injected into document head');
    }
  }, []);

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

  // Request web push notification permission after user interaction
  useEffect(() => {
    if (Platform.OS === 'web') {
      const setupNotifications = async () => {
        try {
          // Wait for user to interact with the app
          setTimeout(async () => {
            try {
              // Import dynamically to avoid issues
              const { subscribeToWebPush } = await import('../lib/webNotifications');
              await subscribeToWebPush();
            } catch (subError) {
              console.log('Could not setup web push:', subError);
            }
          }, 5000); // Wait 5 seconds after app loads
        } catch (error) {
          console.log('Notification setup skipped:', error);
        }
      };
      
      setupNotifications().catch(() => {
        // Silently fail - don't break the app
      });
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
