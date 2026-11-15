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

/**
 * Every walker needs a row in `profiles`: group walks, friends and chat all point at it.
 * Nothing creates one at sign-up, so create it (id only; no email, which other
 * signed-in users could read) the first time it is needed. Safe to call repeatedly.
 */
export async function ensureMyProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (data) return;
  const { error } = await supabase.from('profiles').insert({ id: user.id });
  if (error && error.code !== '23505') throw error; // 23505 = already created by another tab
}