import { supabase } from '../supabaseClient';

/** Exchange a token from a deep link for a session_id and join */
export async function redeemInviteToken(token: string) {
  // If you created an RPC, use it; otherwise read invite + join.
  const { data, error } = await supabase
    .from('session_invites')
    .select('session_id')
    .eq('token', token)
    .single();
  if (error) throw error;

  const sessionId = (data as any).session_id as string;

  const { error: joinErr } = await supabase
    .from('session_participants')
    .insert({ session_id: sessionId, user_id: (await supabase.auth.getUser()).data.user!.id });
  if (joinErr && !String(joinErr.message).includes('duplicate')) throw joinErr;

  return sessionId;
}
