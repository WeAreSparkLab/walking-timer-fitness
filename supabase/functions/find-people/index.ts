// supabase/functions/find-people/index.ts
// Find someone to add as a friend or invite, by the start of a username (3+ letters) or by a COMPLETE email.
// Returns only id, username and avatar. An email address is never returned, and there is no
// partial-email search. Deployed with JWT verification; the caller must be a signed-in user.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Light brake on guessing: at most 15 searches a minute per person (per running copy of the function).
const recent = new Map<string, number[]>();
function tooMany(id: string) {
  const now = Date.now();
  const list = (recent.get(id) ?? []).filter(t => now - t < 60_000);
  list.push(now);
  recent.set(id, list);
  return list.length > 15;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: u, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !u?.user) return json({ error: 'Not signed in' }, 401);
    const me = u.user.id;
    if (tooMany(me)) return json({ error: 'Too many searches. Please wait a minute.' }, 429);

    const { query } = await req.json();
    const q = String(query ?? '').trim().toLowerCase();
    if (q.length < 3 || q.length > 120) return json({ people: [] });

    let ids: string[] = [];
    if (q.includes('@')) {
      // Exact email only.
      for (let page = 1; page <= 10; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        const users = data?.users ?? [];
        const hit = users.find((x: any) => (x.email ?? '').toLowerCase() === q);
        if (hit) { ids = [hit.id]; break; }
        if (users.length < 1000) break;
      }
    } else {
      const safe = q.replace(/[\\%_]/g, (m) => '\\' + m);
      const { data } = await admin.from('profiles').select('id').ilike('username', safe + '%').neq('id', me).limit(20);
      ids = (data ?? []).map((x: any) => x.id);
    }
    ids = ids.filter(id => id !== me);
    if (!ids.length) return json({ people: [] });

    const { data: profs } = await admin.from('profiles').select('id, username, avatar_url').in('id', ids).order('username');
    return json({ people: profs ?? [] });
  } catch (e: any) {
    console.error('find-people error', String(e?.message ?? e).slice(0, 160));
    return json({ error: 'Something went wrong' }, 500);
  }
});