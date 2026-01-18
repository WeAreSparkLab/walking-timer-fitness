import { supabase } from '../supabaseClient';

export type Message = {
  id: string;
  session_id: string;
  sender_id: string;
  text: string;
  created_at: string;
  sender?: {
    username: string;
    avatar_url?: string;
  };
};

export async function sendMessage(sessionId: string, text: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('session_messages')
    .insert({ session_id: sessionId, sender_id: user.id, text })
    .select()
    .single();
  if (error) throw error;
  
  // Fetch sender profile separately
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, avatar_url')
    .eq('id', user.id)
    .single();
  
  return { ...data, sender: profile } as Message;
}

export async function getMessages(sessionId: string) {
  const { data: messages, error } = await supabase
    .from('session_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });
  
  if (error) throw error;
  if (!messages || messages.length === 0) return [];
  
  // Get all unique sender IDs
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  
  // Fetch all profiles in one query
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', senderIds);
  
  // Create a map for quick lookup
  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);
  
  // Attach profiles to messages
  return messages.map(msg => ({
    ...msg,
    sender: profileMap.get(msg.sender_id)
  })) as Message[];
}

export function subscribeMessages(sessionId: string, onNew: (m: Message) => void) {
  const channel = supabase
    .channel(`messages:${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'session_messages',
      filter: `session_id=eq.${sessionId}`,
    }, async (payload) => {
      // Fetch sender profile separately
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', payload.new.sender_id)
        .single();
      
      onNew({ ...payload.new, sender: profile } as Message);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
