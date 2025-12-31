import { supabase } from '../supabaseClient';

export type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function getMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile) ?? null;
}

export async function upsertMyProfile(patch: Partial<Profile>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  // IMPORTANT: include id for RLS policies (id = auth.uid())
  const payload = { id: user.id, ...patch };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data as Profile;
}
