import { supabase } from '../supabaseClient';

export type Message = {
  id: string;
  session_id: string;
  sender_id: string;
  text: string;
  created_at: string;
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
  return data as Message;
}

export function subscribeMessages(sessionId: string, onNew: (m: Message) => void) {
  const channel = supabase
    .channel(`messages:${sessionId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'session_messages',
      filter: `session_id=eq.${sessionId}`,
    }, (payload) => onNew(payload.new as Message))
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}
