import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabaseClient';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions from the user
 * Required on iOS and newer Android versions
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      console.log('Push notifications not supported on web');
      return null;
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permission if not already granted
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Permission not granted for notifications');
      return null;
    }

    // Get the Expo push token
    const tokenData = await Notifications.getExpoPushTokenAsync();

    console.log('Push token:', tokenData.data);
    return tokenData.data;
  } catch (error) {
    console.error('Error registering for push notifications:', error);
    return null;
  }
}

/**
 * Save the user's push token to their profile in Supabase
 */
export async function savePushToken(token: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      console.error('No authenticated user');
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({ push_token: token })
      .eq('id', user.id);

    if (error) {
      console.error('Error saving push token:', error);
    } else {
      console.log('Push token saved successfully');
    }
  } catch (error) {
    console.error('Error in savePushToken:', error);
  }
}

/**
 * Initialize push notifications: request permission and save token
 * Call this when the app starts or user logs in
 */
export async function initializePushNotifications(): Promise<void> {
  const token = await registerForPushNotifications();
  if (token) {
    await savePushToken(token);
  }
}

/**
 * Schedule a local notification (for testing or immediate notifications)
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: any
): Promise<void> {
  if (Platform.OS === 'web') {
    console.log('Local notifications not supported on web');
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: null, // Show immediately
  });
}

/**
 * Listen for notifications while the app is in foreground
 */
export function addNotificationListener(
  callback: (notification: Notifications.Notification) => void
): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

/**
 * Listen for notification taps (when user interacts with notification)
 */
export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

/**
 * Send a push notification to specific users
 * NOTE: This should typically be done from a backend/cloud function
 * Included here for reference - you'll need Expo's push notification service
 */
export async function sendPushNotification(
  expoPushTokens: string[],
  title: string,
  body: string,
  data?: any
): Promise<void> {
  const messages = expoPushTokens.map(token => ({
    to: token,
    sound: 'default',
    title,
    body,
    data,
  }));

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    console.log('Push notification result:', result);
  } catch (error) {
    console.error('Error sending push notification:', error);
  }
}

/**
 * Notify friends when a user starts a group walk
 */
export async function notifyFriendsOfGroupWalk(
  sessionId: string,
  sessionName: string,
  friendIds: string[]
): Promise<void> {
  try {
    // Get push tokens for these friends
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('push_token')
      .in('id', friendIds)
      .not('push_token', 'is', null);

    if (error) {
      console.error('Error fetching friend push tokens:', error);
      return;
    }

    const tokens = profiles?.map(p => p.push_token).filter(Boolean) || [];
    
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        'Friend started a walk! 🚶‍♂️',
        `Join ${sessionName} now`,
        { type: 'session_invite', sessionId }
      );
    }
  } catch (error) {
    console.error('Error notifying friends:', error);
  }
}

/**
 * Notify user when they receive a friend request
 */
export async function notifyFriendRequest(
  recipientId: string,
  senderUsername: string
): Promise<void> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !profile?.push_token) {
      console.log('No push token for recipient');
      return;
    }

    await sendPushNotification(
      [profile.push_token],
      'New Friend Request',
      `${senderUsername} wants to be friends`,
      { type: 'friend_request' }
    );
  } catch (error) {
    console.error('Error sending friend request notification:', error);
  }
}

/**
 * Notify user when someone accepts their friend request
 */
export async function notifyFriendRequestAccepted(
  recipientId: string,
  accepterUsername: string
): Promise<void> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('push_token')
      .eq('id', recipientId)
      .single();

    if (error || !profile?.push_token) {
      return;
    }

    await sendPushNotification(
      [profile.push_token],
      'Friend Request Accepted! 🎉',
      `${accepterUsername} is now your friend`,
      { type: 'friend_accepted' }
    );
  } catch (error) {
    console.error('Error sending acceptance notification:', error);
  }
}

/**
 * Notify participants when a new chat message is sent (only if they're not in the app)
 */
export async function notifyNewChatMessage(
  sessionId: string,
  senderUsername: string,
  messageText: string,
  participantIds: string[]
): Promise<void> {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('push_token')
      .in('id', participantIds)
      .not('push_token', 'is', null);

    if (error || !profiles?.length) {
      return;
    }

    const tokens = profiles.map(p => p.push_token).filter(Boolean);
    
    if (tokens.length > 0) {
      await sendPushNotification(
        tokens,
        `${senderUsername} sent a message`,
        messageText.length > 50 ? messageText.substring(0, 47) + '...' : messageText,
        { type: 'chat_message', sessionId }
      );
    }
  } catch (error) {
    console.error('Error sending chat notification:', error);
  }
}
