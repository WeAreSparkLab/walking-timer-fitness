import { supabase } from '../supabaseClient';
import { notifyFriendRequest, notifyFriendRequestAccepted } from '../notifications';

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

  // Get requester username for notification
  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single();

  // Send push notification to addressee
  if (profile?.username) {
    await notifyFriendRequest(addresseeId, profile.username);
  }

  return data as Friendship;
}

export async function respondToFriendRequest(friendshipId: string, status: 'accepted'|'blocked') {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('friendships')
    .update({ status })
    .eq('id', friendshipId)
    .select()
    .single();
  if (error) throw error;

  // If accepted, notify the requester
  if (status === 'accepted' && data) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profile?.username) {
      await notifyFriendRequestAccepted(data.requester_id, profile.username);
    }
  }

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
    .select('*')
    .eq('addressee_id', user.id)
    .eq('status', 'pending');
  if (error) throw error;

  if (!data || data.length === 0) return [];

  // Fetch requester profiles separately
  const requesterIds = data.map(f => f.requester_id);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', requesterIds);
  
  if (profileError) throw profileError;

  // Create a map of profiles by ID
  const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

  // Combine friendships with requester profiles
  return data.map(friendship => ({
    ...friendship,
    requester: profileMap.get(friendship.requester_id) || { id: friendship.requester_id, username: null, avatar_url: null }
  })) as (Friendship & {
    requester: { id: string; username: string | null; avatar_url: string | null };
  })[];
}
