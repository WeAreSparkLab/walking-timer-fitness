import { supabase } from '../supabaseClient';
import { sendNotificationToUser } from './notifications';

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

  // Send push notification to addressee via Edge Function
  if (profile?.username) {
    await sendNotificationToUser(
      addresseeId,
      '👋 Friend Request',
      `${profile.username} wants to be your friend!`,
      { type: 'friend_request', requester_id: user.id, requester_name: profile.username }
    );
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

  // If accepted, notify the requester via Edge Function
  if (status === 'accepted' && data) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .single();

    if (profile?.username) {
      await sendNotificationToUser(
        data.requester_id,
        '🎉 Friend Request Accepted',
        `${profile.username} accepted your friend request!`,
        { type: 'friend_accepted', friend_id: user.id, friend_name: profile.username }
      );
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

/**
 * Remove a friend (delete the friendship record)
 */
export async function removeFriend(friendId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // First, find the friendship record
  const { data: friendship, error: findError } = await supabase
    .from('friendships')
    .select('id')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`)
    .eq('status', 'accepted')
    .maybeSingle();

  if (findError) {
    console.error('Error finding friendship:', findError);
    throw findError;
  }

  if (!friendship) {
    console.log('No friendship found to delete');
    return;
  }

  // Delete by ID
  const { error: deleteError } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendship.id);

  if (deleteError) {
    console.error('Error deleting friendship:', deleteError);
    throw deleteError;
  }

  console.log('Friendship deleted successfully:', friendship.id);
}

/**
 * Get friendship status with another user
 */
export async function getFriendshipStatus(
  otherUserId: string
): Promise<{ status: 'none' | 'pending_sent' | 'pending_received' | 'friends'; friendshipId?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: 'none' };

  // Check for any friendship record between the two users
  const { data, error } = await supabase
    .from('friendships')
    .select('*')
    .or(`and(requester_id.eq.${user.id},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${user.id})`)
    .maybeSingle();

  if (error || !data) return { status: 'none' };

  if (data.status === 'accepted') {
    return { status: 'friends', friendshipId: data.id };
  }

  if (data.status === 'pending') {
    if (data.requester_id === user.id) {
      return { status: 'pending_sent', friendshipId: data.id };
    } else {
      return { status: 'pending_received', friendshipId: data.id };
    }
  }

  return { status: 'none' };
}

/**
 * Cancel a pending friend request that you sent
 */
export async function cancelFriendRequest(friendshipId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
    .eq('requester_id', user.id)
    .eq('status', 'pending');

  if (error) throw error;
}
