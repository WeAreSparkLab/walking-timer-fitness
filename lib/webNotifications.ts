// Browser notification utilities for PWA (Web only)
import { supabase } from './supabaseClient';

export type NotificationType = 
  | 'friend_request'
  | 'walk_invite'
  | 'group_message'
  | 'direct_message';

interface NotificationData {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  icon?: string;
}

/**
 * Helper to convert VAPID key
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Subscribe to web push notifications
 */
export async function subscribeToWebPush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Web Push not supported');
    return;
  }

  try {
    // Request notification permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied');
      return;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Subscribe to push notifications
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib37J8eN2AIo8KJfCy9o6dKZ5p8X9h5HQNdQgBTj5rD3Q8pTqJYdxbM8XQU'
      )
    });

    // Save subscription to database
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from('profiles')
        .update({ web_push_subscription: subscription.toJSON() })
        .eq('id', user.id);

      console.log('✅ Web push subscription saved');
    }
  } catch (error) {
    console.error('Failed to subscribe to web push:', error);
  }
}

/**
 * Send web push notification to a user
 */
export async function sendWebPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<void> {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Trigger notification via service worker
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: data,
      tag: data?.type || 'notification',
      requireInteraction: false,
    });

    console.log('✅ Web notification shown');
  } catch (error) {
    console.error('Failed to show web notification:', error);
  }
}

/**
 * Request notification permission from the user
 * @returns Promise<boolean> true if permission granted
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.log('This browser does not support notifications');
    return false;
  }

  if (Notification.permission === 'granted') {
    return true;
  }

  if (Notification.permission === 'denied') {
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return false;
  }
}

/**
 * Check if notifications are supported and permitted
 */
export function canShowNotifications(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  );
}

/**
 * Show a browser notification
 * @param data Notification data including type, title, body, url
 */
export async function showNotification(data: NotificationData): Promise<void> {
  if (!canShowNotifications()) {
    console.log('Notifications not available or not permitted');
    return;
  }

  try {
    // Check if service worker is available
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Use service worker to show notification (better for PWA)
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/icon.png',
        badge: '/icon.png',
        tag: data.type,
        data: {
          url: data.url || '/',
          type: data.type,
        },
        requireInteraction: false,
        vibrate: [200, 100, 200],
      });
    } else {
      // Fallback to basic notification
      const notification = new Notification(data.title, {
        body: data.body,
        icon: data.icon || '/icon.png',
        tag: data.type,
      });

      // Handle notification click
      if (data.url) {
        notification.onclick = () => {
          window.focus();
          window.location.href = data.url;
          notification.close();
        };
      }
    }
  } catch (error) {
    console.error('Error showing notification:', error);
  }
}

/**
 * Show notification for incoming friend request
 */
export async function notifyFriendRequest(fromUsername: string): Promise<void> {
  await showNotification({
    type: 'friend_request',
    title: '👥 New Friend Request',
    body: `${fromUsername} wants to be your friend`,
    url: '/friends?tab=requests',
  });
}

/**
 * Show notification for walk invite
 */
export async function notifyWalkInvite(fromUsername: string, walkName?: string): Promise<void> {
  const body = walkName 
    ? `${fromUsername} invited you to join "${walkName}"`
    : `${fromUsername} invited you to join a group walk`;
  
  await showNotification({
    type: 'walk_invite',
    title: '🚶 Walk Invitation',
    body,
    url: '/dashboard',
  });
}

/**
 * Show notification for new group message
 */
export async function notifyGroupMessage(
  senderUsername: string, 
  message: string, 
  sessionId: string
): Promise<void> {
  // Don't show notification if user is currently viewing the chat
  if (typeof window !== 'undefined' && window.location.pathname.includes('/walk-timer')) {
    return;
  }

  const truncatedMessage = message.length > 50 
    ? message.substring(0, 50) + '...' 
    : message;

  await showNotification({
    type: 'group_message',
    title: `💬 ${senderUsername}`,
    body: truncatedMessage,
    url: `/walk-timer?id=${sessionId}`,
  });
}

/**
 * Show notification for new direct message
 */
export async function notifyDirectMessage(
  senderUsername: string, 
  message: string, 
  senderId: string
): Promise<void> {
  // Don't show notification if user is currently viewing this chat
  if (typeof window !== 'undefined' && window.location.pathname.includes(`/chat/${senderId}`)) {
    return;
  }

  const truncatedMessage = message.length > 50 
    ? message.substring(0, 50) + '...' 
    : message;

  await showNotification({
    type: 'direct_message',
    title: `💬 ${senderUsername}`,
    body: truncatedMessage,
    url: `/chat/${senderId}`,
  });
}
