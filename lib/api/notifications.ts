import { supabase, NOTIFICATION_FUNCTION_URL } from '../supabaseClient';

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  created_at: string;
};

/**
 * Send notification to a user via Edge Function
 * This handles in-app notifications, web push, and mobile push automatically
 */
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: any
): Promise<boolean> {
  try {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;

    const response = await fetch(NOTIFICATION_FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId,
        title,
        body,
        data,
      }),
    });

    if (!response.ok) {
      console.error('Failed to send notification:', await response.text());
      return await inAppFallback(userId, title, body, data);
    }

    return true;
  } catch (error) {
    console.error('Error sending notification:', error);
    return await inAppFallback(userId, title, body, data);
  }
}

/**
 * If the notification function isn't reachable, still leave an in-app notification for the
 * kinds that show in the badge (walk invitations and accepted friend requests). Friend requests
 * themselves are counted straight from the friendships table, so they need no row.
 */
async function inAppFallback(userId: string, title: string, body: string, data?: any): Promise<boolean> {
  const type = data?.type;
  if (type !== 'walk_invite' && type !== 'friend_accepted') return false;
  // Preferred: the database function that only lets friends notify each other (supabase/proposed/notify_friend.sql).
  const { error } = await supabase.rpc('notify_friend', { p_user: userId, p_type: type, p_title: title, p_message: body, p_data: data ?? {} });
  if (!error) return true;
  // Not installed yet: fall back to a direct insert (allowed by the current, more open, rule).
  if (error.code === 'PGRST202' || /notify_friend/i.test(error.message)) {
    try { await createNotification(userId, type, title, body, data); return true; } catch { return false; }
  }
  return false;
}

/**
 * Create a notification for a user
 */
export async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  data?: any
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .insert({
      user_id: userId,
      type,
      title,
      message,
      data,
    });

  if (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Get all notifications for current user
 */
export async function getMyNotifications(): Promise<Notification[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 0;

  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
  return count || 0;
}

/**
 * Mark notification as read
 */
export async function markAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notificationId);

  if (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('user_id', user.id)
    .eq('read', false);

  if (error) {
    console.error('Error marking all as read:', error);
    throw error;
  }
}

/**
 * Subscribe to new notifications
 */
export function subscribeToNotifications(
  userId: string,
  callback: (notification: Notification) => void
) {
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        callback(payload.new as Notification);
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
