// lib/api/people.ts — find people to add or invite.
// Username (start, 3+ letters) or a COMPLETE email address. Emails are never returned.
import { supabase } from '../supabaseClient';

export type Person = { id: string; username: string | null; avatar_url: string | null };

export async function findPeople(query: string): Promise<{ people: Person[]; note?: string }> {
  const q = query.trim();
  if (q.length < 3) return { people: [], note: 'Type at least 3 letters of a username, or someone’s full email address.' };

  // Preferred: the find-people function (it can look up an exact email).
  try {
    const { data, error } = await supabase.functions.invoke('find-people', { body: { query: q } });
    if (!error && data && Array.isArray(data.people)) return { people: data.people as Person[] };
    if (error && /429|too many/i.test(String((error as any).message))) return { people: [], note: 'That’s a lot of searches. Please wait a minute and try again.' };
  } catch { /* fall through to the username-only search */ }

  // Fallback: usernames only.
  const safe = q.replace(/[%_,()\\]/g, '');
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.from('profiles').select('id, username, avatar_url').ilike('username', `${safe}%`).neq('id', user?.id ?? '').limit(20);
  if (error) throw error;
  return { people: (data || []) as Person[], note: q.includes('@') ? 'Searching by email isn’t available right now. Try their username.' : undefined };
}