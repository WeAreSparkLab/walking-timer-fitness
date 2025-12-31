import { supabase } from '../supabaseClient';

export type Pace = 'WARMUP' | 'FAST' | 'SLOW' | 'COOLDOWN';
export type IntervalDTO = { pace: Pace; minutes: number; seconds: number };

export type Session = {
  id: string;
  host_id: string;
  name: string | null;
  plan: IntervalDTO[];       // stored as jsonb
  start_time: string | null; // ISO
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
};

export async function createSession(name: string, plan: IntervalDTO[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('sessions')
    .insert({ host_id: user.id, name, plan, status: 'scheduled' })
    .select()
    .single();
  if (error) throw error;

  // host joins as participant
  await supabase.from('session_participants')
    .insert({ session_id: data.id, user_id: user.id, role: 'host' });

  return data as Session;
}

export async function getSession(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();
  if (error) throw error;
  return data as Session;
}

export async function createInvite(sessionId: string) {
  const { data, error } = await supabase
    .from('session_invites')
    .upsert({ session_id: sessionId }, { onConflict: 'session_id' })
    .select()
    .single();
  if (error) throw error;
  // You’ll convert this token into a deep/universal link in the app
  return data.token as string;
}

export async function joinSession(sessionId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('session_participants')
    .insert({ session_id: sessionId, user_id: user.id });
  if (error && !String(error.message).includes('duplicate')) throw error;
  return true;
}

export async function startSession(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ status: 'active', start_time: new Date().toISOString() })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as Session;
}

export async function completeSession(sessionId: string) {
  const { data, error } = await supabase
    .from('sessions')
    .update({ status: 'completed' })
    .eq('id', sessionId)
    .select()
    .single();
  if (error) throw error;
  return data as Session;
}

export type Participant = {
  session_id: string;
  user_id: string;
  role: 'host' | 'member';
  joined_at: string;
};

export async function listParticipants(sessionId: string) {
  const { data, error } = await supabase
    .from('session_participants')
    .select('*, profile:profiles!session_participants_user_id_fkey(id,username,avatar_url)')
    .eq('session_id', sessionId);
  if (error) throw error;

  return data as (Participant & {
    profile: { id: string; username: string | null; avatar_url: string | null };
  })[];
}
