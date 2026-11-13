// lib/api/together.ts — Walk Together v2 (needs supabase/proposed/walk_together_v2.sql)
import { supabase } from '../supabaseClient';
import type { IntervalDTO } from './sessions';

export type TogetherSession = {
  id: string;
  host_id: string;
  name: string | null;
  plan: IntervalDTO[];
  status: 'scheduled' | 'active' | 'completed' | 'cancelled';
  started_at: string | null;
  paused_at: string | null;
  paused_total_ms: number | string;
  ends_at: string | null;
  created_at: string;
};

export type Walker = { user_id: string; ready: boolean; username: string | null; avatar_url: string | null };

export type InvitePreview = { session_id: string; walk_name: string | null; plan: IntervalDTO[]; host_name: string | null; walkers: number; expired: boolean };

/** Invitation opened while signed out; picked up after sign-in. */
export const PENDING_JOIN_KEY = 'sparkwalk.pendingJoin';

export const inviteLink = (token: string) =>
  (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://walks.wearesparklab.com') + `/join/${token}`;

export async function fetchServerNow(): Promise<string> {
  const { data, error } = await supabase.rpc('server_now');
  if (error) throw error;
  return data as string;
}

export async function createTogetherWalk(name: string, plan: IntervalDTO[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Please sign in first.');
  const { data, error } = await supabase.from('sessions').insert({ host_id: user.id, name, plan, status: 'scheduled' }).select().single();
  if (error) throw error;
  const { error: pErr } = await supabase.from('session_participants').insert({ session_id: data.id, user_id: user.id, ready: true });
  if (pErr) throw pErr;
  const token = await rotateInvite(data.id);
  return { session: data as TogetherSession, token };
}

export async function getTogether(sessionId: string) {
  const { data, error } = await supabase.from('sessions').select('*').eq('id', sessionId).single();
  if (error) throw error;
  return data as TogetherSession;
}

export async function getWalkers(sessionId: string): Promise<Walker[]> {
  const { data, error } = await supabase
    .from('session_participants')
    .select('user_id, ready, profile:profiles!session_participants_user_id_fkey(username, avatar_url)')
    .eq('session_id', sessionId);
  if (error) throw error;
  return (data || []).map((r: any) => ({ user_id: r.user_id, ready: !!r.ready, username: r.profile?.username ?? null, avatar_url: r.profile?.avatar_url ?? null }));
}

/** Host only: the current link (RLS hides tokens from everyone else). */
export async function getInviteToken(sessionId: string): Promise<{ token: string; expires_at: string } | null> {
  const { data } = await supabase.from('session_invites').select('token, expires_at').eq('session_id', sessionId).maybeSingle();
  return (data as any) ?? null;
}

const rpc = async <T,>(fn: string, args: Record<string, unknown>) => {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
};

export const rotateInvite = (sessionId: string) => rpc<string>('rotate_invite', { p_session: sessionId });
export const startTogether = (sessionId: string, countdown = 10) => rpc<TogetherSession>('start_walk', { p_session: sessionId, p_countdown_seconds: countdown });
export const pauseTogether = (sessionId: string) => rpc<TogetherSession>('pause_walk', { p_session: sessionId });
export const resumeTogether = (sessionId: string) => rpc<TogetherSession>('resume_walk', { p_session: sessionId });
export const redeemInvite = (token: string) => rpc<string>('redeem_invite', { p_token: token });

export async function previewInvite(token: string): Promise<InvitePreview | null> {
  const rows = await rpc<InvitePreview[]>('preview_invite', { p_token: token });
  return rows?.[0] ?? null;
}

export async function setReady(sessionId: string, ready: boolean) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('session_participants').update({ ready }).eq('session_id', sessionId).eq('user_id', user.id);
}

export async function markCompleted(sessionId: string) {
  await supabase.from('sessions').update({ status: 'completed' }).eq('id', sessionId); // host-only by RLS
}

export async function leaveTogether(sessionId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('session_participants').delete().eq('session_id', sessionId).eq('user_id', user.id);
}

export async function cancelTogether(sessionId: string) {
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId); // host-only by RLS
  if (error) throw error;
}

/**
 * Live updates for one walk: session row changes, walker changes, and
 * presence (who currently has the app open). Returns an unsubscribe.
 */
export function subscribeTogether(
  sessionId: string,
  me: { id: string; username: string | null },
  on: {
    session: (s: TogetherSession) => void;
    walkersChanged: () => void;
    presence: (onlineIds: string[]) => void;
    status: (s: 'connected' | 'connecting' | 'offline') => void;
  }
) {
  const ch = supabase.channel(`together:${sessionId}`, { config: { presence: { key: me.id } } });
  ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions', filter: `id=eq.${sessionId}` },
    p => on.session(p.new as TogetherSession));
  ch.on('postgres_changes', { event: '*', schema: 'public', table: 'session_participants', filter: `session_id=eq.${sessionId}` },
    () => on.walkersChanged());
  ch.on('presence', { event: 'sync' }, () => on.presence(Object.keys(ch.presenceState())));
  on.status('connecting');
  ch.subscribe(async status => {
    if (status === 'SUBSCRIBED') {
      on.status('connected');
      try { await ch.track({ username: me.username }); } catch {}
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      on.status('offline');
    }
  });
  return () => { supabase.removeChannel(ch); };
}
