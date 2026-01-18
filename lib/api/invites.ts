import { supabase } from '../supabaseClient';

/** Exchange a token from a deep link for a session_id and join */
export async function redeemInviteToken(token: string) {
  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    throw new Error('You must be logged in to join a session');
  }

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
    .insert({ session_id: sessionId, user_id: user.id });
  if (joinErr && !String(joinErr.message).includes('duplicate')) throw joinErr;

  return sessionId;
}
