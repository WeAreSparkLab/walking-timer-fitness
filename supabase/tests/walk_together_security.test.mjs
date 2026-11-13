// Runs the real Spark Walk schema + the Walk Together v2 proposal in a local
// Postgres (PGlite), then checks security rules and host controls as
// different users. Nothing here talks to Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';

const [schemaPath, proposalPath] = process.argv.slice(2);
const db = new PGlite();

// Minimal stand-ins for what Supabase provides.
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated, anon;
  grant execute on function auth.uid() to authenticated, anon;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  create publication supabase_realtime;
  grant usage on schema public to authenticated, anon;
  alter default privileges in schema public grant all on tables to authenticated;
`);

await db.exec(readFileSync(schemaPath, 'utf8'));
await db.exec(readFileSync(proposalPath, 'utf8'));
await db.exec(`grant all on all tables in schema public to authenticated;`);

const HOST = '11111111-1111-1111-1111-111111111111';
const FRIEND = '22222222-2222-2222-2222-222222222222';
const STRANGER = '33333333-3333-3333-3333-333333333333';
for (const [id, name] of [[HOST, 'sara'], [FRIEND, 'friend'], [STRANGER, 'stranger']]) {
  await db.query(`insert into auth.users (id) values ($1)`, [id]);
  await db.query(`insert into public.profiles (id, username) values ($1, $2) on conflict (id) do update set username = excluded.username`, [id, name]);
}

async function as(user, sql, params = []) {
  await db.exec('reset role');
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await db.exec('set role authenticated');
  try { return { rows: (await db.query(sql, params)).rows }; }
  catch (e) { return { error: e.message }; }
  finally { await db.exec('reset role'); }
}

let pass = 0, fail = 0;
const check = (label, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`); };

// Host creates a walk (same two inserts the app makes today).
const plan = JSON.stringify([{ pace: 'WARMUP', minutes: 1, seconds: 0 }, { pace: 'FAST', minutes: 2, seconds: 30 }]);
const created = await as(HOST, `insert into public.sessions (host_id, name, plan) values ($1, 'Morning walk', $2::jsonb) returning id`, [HOST, plan]);
const sid = created.rows?.[0]?.id;
check('host can create a walk', !!sid, created.error);
check('host can add themselves as a walker', !(await as(HOST, `insert into public.session_participants (session_id, user_id) values ($1, $2)`, [sid, HOST])).error);
const tok = await as(HOST, `select public.rotate_invite($1) as t`, [sid]);
const token = tok.rows?.[0]?.t;
check('host can create an invitation link', !!token, tok.error);

// Strangers.
check('stranger cannot see the walk', (await as(STRANGER, `select id from public.sessions where id = $1`, [sid])).rows?.length === 0);
check('stranger cannot list invitation tokens', (await as(STRANGER, `select token from public.session_invites`)).rows?.length === 0);
check('stranger cannot see who is walking', (await as(STRANGER, `select user_id from public.session_participants where session_id = $1`, [sid])).rows?.length === 0);
check('stranger cannot join without an invitation', !!(await as(STRANGER, `insert into public.session_participants (session_id, user_id) values ($1, $2)`, [sid, STRANGER])).error);
check('stranger cannot start the walk', !!(await as(STRANGER, `select public.start_walk($1)`, [sid])).error);

// Invitation flow.
const prev = await as(FRIEND, `select * from public.preview_invite($1)`, [token]);
const p = prev.rows?.[0];
check('invite preview shows walk name and host username only', p?.walk_name === 'Morning walk' && p?.host_name === 'sara' && p?.walkers === 1 && p?.expired === false && !('email' in (p || {})), JSON.stringify(p));
check('wrong token joins nothing', !!(await as(FRIEND, `select public.redeem_invite('nope')`)).error);
const red = await as(FRIEND, `select public.redeem_invite($1) as sid`, [token]);
check('friend joins with the invitation', red.rows?.[0]?.sid === sid, red.error);
check('joining twice is harmless', !(await as(FRIEND, `select public.redeem_invite($1)`, [token])).error);
check('friend can now see the walk', (await as(FRIEND, `select id from public.sessions where id = $1`, [sid])).rows?.length === 1);
check('friend sees both walkers', (await as(FRIEND, `select user_id from public.session_participants where session_id = $1`, [sid])).rows?.length === 2);
check('friend cannot read the invitation token', (await as(FRIEND, `select token from public.session_invites`)).rows?.length === 0);
check('friend can mark themselves ready', (await as(FRIEND, `update public.session_participants set ready = true where session_id = $1 and user_id = $2 returning ready`, [sid, FRIEND])).rows?.[0]?.ready === true);
check('friend cannot mark the host ready', (await as(FRIEND, `update public.session_participants set ready = true where session_id = $1 and user_id = $2 returning ready`, [sid, HOST])).rows?.length === 0);
check('friend cannot pause for everyone', !!(await as(FRIEND, `select public.pause_walk($1)`, [sid])).error);

// Host controls.
const st = (await as(HOST, `select * from public.start_walk($1, 10)`, [sid])).rows?.[0];
const lead = st && (new Date(st.started_at) - Date.now()) / 1000;
const len = st && (new Date(st.ends_at) - new Date(st.started_at)) / 1000;
check('start sets a shared start time ~10s ahead', st && lead > 8 && lead < 11, `lead ${lead?.toFixed(1)}s`);
check('end time = start + plan length (3:30)', len === 210, `length ${len}s`);
check('status becomes active', st?.status === 'active');
const pz = (await as(HOST, `select * from public.pause_walk($1)`, [sid])).rows?.[0];
check('host can pause', !!pz?.paused_at);
await new Promise(r => setTimeout(r, 1200));
const rs = (await as(HOST, `select * from public.resume_walk($1)`, [sid])).rows?.[0];
const shift = rs && (new Date(rs.ends_at) - new Date(st.ends_at));
check('resume adds the paused time to the timeline', rs && rs.paused_at === null && Number(rs.paused_total_ms) >= 1000 && Math.abs(shift - Number(rs.paused_total_ms)) < 5, `paused ${rs?.paused_total_ms}ms, end moved ${shift}ms`);
check('resume twice is harmless', !(await as(HOST, `select public.resume_walk($1)`, [sid])).error);
check('server clock is available', !!(await as(FRIEND, `select public.server_now() as t`)).rows?.[0]?.t);

// Expiry.
await db.query(`update public.session_invites set expires_at = now() - interval '1 minute' where session_id = $1`, [sid]);
check('expired invitation is refused', !!(await as(STRANGER, `select public.redeem_invite($1)`, [token])).error);
check('preview says expired', (await as(STRANGER, `select expired from public.preview_invite($1)`, [token])).rows?.[0]?.expired === true);

// Existing behaviour that must keep working.
check('walkers can still chat', !(await as(FRIEND, `insert into public.session_messages (session_id, sender_id, text) values ($1, $2, 'hi')`, [sid, FRIEND])).error);
check('friend can leave', (await as(FRIEND, `delete from public.session_participants where session_id = $1 and user_id = $2 returning user_id`, [sid, FRIEND])).rows?.length === 1);
check('host can delete the walk', (await as(HOST, `delete from public.sessions where id = $1 returning id`, [sid])).rows?.length === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
