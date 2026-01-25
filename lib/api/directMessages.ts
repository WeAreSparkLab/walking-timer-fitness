import { supabase } from '../supabaseClient';
import { sendNotificationToUser } from './notifications';

export type DirectMessage = {
  id: string;
  sender_id: string;
  recipient_id: string;
  text: string;
  created_at: string;
  read_at: string | null;
  sender?: {
    id: string;
    username: string | null;
    avatar_url: string | null;
  };
};

export async function getConversation(friendId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // Get messages where either user is sender or recipient
  const { data, error } = await supabase
    .from('direct_messages')
    .select('*')
    .or(`and(sender_id.eq.${user.id},recipient_id.eq.${friendId}),and(sender_id.eq.${friendId},recipient_id.eq.${user.id})`)
    .order('created_at', { ascending: true });

  if (error) throw error;

  // Fetch both users' profiles
  const userIds = [user.id, friendId];
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', userIds);

  if (profileError) throw profileError;

  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  return (data || []).map(msg => ({
    ...msg,
    sender: profileMap.get(msg.sender_id)
  })) as DirectMessage[];
}

export async function sendDirectMessage(recipientId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('direct_messages')
    .insert({ sender_id: user.id, recipient_id: recipientId, text })
    .select()
    .single();

  if (error) throw error;

  // Fetch sender profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .eq('id', user.id)
    .single();

  // Send push notification to recipient
  const senderName = profile?.username || 'Someone';
  const previewText = text.length > 50 ? text.substring(0, 50) + '...' : text;
  await sendNotificationToUser(
    recipientId,
    `💬 ${senderName}`,
    previewText,
    { type: 'direct_message', sender_id: user.id, sender_name: senderName }
  );

  return {
    ...data,
    sender: profile
  } as DirectMessage;
}

export function subscribeToConversation(friendId: string, onChange: (message: DirectMessage) => void) {
  const channel = supabase
    .channel(`direct-messages:${friendId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'direct_messages',
    }, async (payload) => {
      const msg = payload.new as DirectMessage;
      
      // Fetch sender profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .eq('id', msg.sender_id)
        .single();

      onChange({
        ...msg,
        sender: profile || undefined
      });
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function markMessagesAsRead(friendId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // Mark all messages from friend as read
  const { error } = await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('sender_id', friendId)
    .eq('recipient_id', user.id)
    .is('read_at', null);

  if (error) throw error;
}
