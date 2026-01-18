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

  // host joins as participant (role will default to 'member', but host_id in sessions table identifies the host)
  const { error: participantError } = await supabase.from('session_participants')
    .insert({ session_id: data.id, user_id: user.id });
  
  if (participantError) {
    console.error('Failed to insert participant:', participantError);
    throw participantError;
  }

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

// Session Progress API
export type SessionProgress = {
  session_id: string;
  user_id: string;
  current_interval: number;
  interval_time_remaining: number;
  is_paused: boolean;
  updated_at: string;
};

export async function updateProgress(
  sessionId: string,
  currentInterval: number,
  intervalTimeRemaining: number,
  isPaused: boolean
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('session_progress')
    .upsert({
      session_id: sessionId,
      user_id: user.id,
      current_interval: currentInterval,
      interval_time_remaining: intervalTimeRemaining,
      is_paused: isPaused,
      updated_at: new Date().toISOString(),
    });
  if (error) throw error;
}

export async function getSessionProgress(sessionId: string) {
  const { data, error } = await supabase
    .from('session_progress')
    .select('*, profile:profiles!session_progress_user_id_fkey(id,username,avatar_url)')
    .eq('session_id', sessionId);
  if (error) throw error;

  return data as (SessionProgress & {
    profile: { id: string; username: string | null; avatar_url: string | null };
  })[];
}

export function subscribeToProgress(sessionId: string, onChange: (progress: SessionProgress[]) => void) {
  const channel = supabase
    .channel(`progress:${sessionId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'session_progress',
      filter: `session_id=eq.${sessionId}`,
    }, async () => {
      // Refetch all progress when any update happens
      const progress = await getSessionProgress(sessionId);
      onChange(progress);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function deleteSession(sessionId: string) {
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('id', sessionId);
  
  if (error) throw error;
}

export async function updateSession(sessionId: string, name: string, plan: IntervalDTO[]) {
  const { error } = await supabase
    .from('sessions')
    .update({ 
      name, 
      plan: plan.map(i => ({ pace: i.pace, minutes: i.minutes, seconds: i.seconds }))
    })
    .eq('id', sessionId);
  
  if (error) throw error;
}

export async function updateSessionControl(sessionId: string, isRunning: boolean, currentInterval: number, timeRemaining: number) {
  console.log('updateSessionControl called:', { sessionId, isRunning, currentInterval, timeRemaining });
  const { data, error } = await supabase
    .from('sessions')
    .update({ 
      status: isRunning ? 'active' : 'scheduled',
      start_time: isRunning ? new Date().toISOString() : null,
      current_interval: currentInterval,
      time_remaining: timeRemaining
    })
    .eq('id', sessionId)
    .select();
  
  if (error) {
    console.error('updateSessionControl error:', error);
    throw error;
  }
  console.log('updateSessionControl success:', data);
}

export function subscribeToSessionControl(sessionId: string, onChange: (data: { isRunning: boolean; currentInterval: number; timeRemaining: number }) => void) {
  console.log('subscribeToSessionControl for session:', sessionId);
  const channel = supabase
    .channel(`session-control:${sessionId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'sessions',
      filter: `id=eq.${sessionId}`,
    }, (payload) => {
      console.log('Session control change received:', payload);
      const session = payload.new as Session;
      onChange({
        isRunning: session.status === 'active',
        currentInterval: (session as any).current_interval || 0,
        timeRemaining: (session as any).time_remaining || 0
      });
    })
    .subscribe((status) => {
      console.log('Subscription status:', status);
    });

  return () => { 
    console.log('Unsubscribing from session control');
    supabase.removeChannel(channel); 
  };
}
