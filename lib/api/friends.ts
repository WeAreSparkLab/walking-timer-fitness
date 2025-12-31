import { supabase } from '../supabaseClient';

export type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: string;
  updated_at: string;
};

export async function sendFriendRequest(addresseeId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('friendships')
    .insert({ requester_id: user.id, addressee_id: addresseeId })
    .select()
    .single();
  if (error) throw error;
  return data as Friendship;
}

export async function respondToFriendRequest(friendshipId: string, status: 'accepted'|'blocked') {
  const { data, error } = await supabase
    .from('friendships')
    .update({ status })
    .eq('id', friendshipId)
    .select()
    .single();
  if (error) throw error;
  return data as Friendship;
}

export async function listMyFriends() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // All accepted relationships where I'm requester or addressee
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
    .eq('status', 'accepted');
  if (error) throw error;

  // Map to the "other" user id
  const friendIds = (data || []).map(f => f.requester_id === user.id ? f.addressee_id : f.requester_id);

  // Pull minimal profile info for each
  const { data: profs, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', friendIds);
  if (pErr) throw pErr;

  return profs ?? [];
}

export async function listIncomingFriendRequests() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!friendships_requester_id_fkey(id,username,avatar_url)')
    .eq('addressee_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;

  return data as (Friendship & {
    requester: { id: string; username: string | null; avatar_url: string | null };
  })[];
}
