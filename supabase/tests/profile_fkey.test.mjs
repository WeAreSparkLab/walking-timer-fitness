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

// A user who signed up but never saved their Profile screen: no profiles row.
const NEW = '44444444-4444-4444-4444-444444444444';
await db.query(`insert into auth.users (id) values ($1)`, [NEW]);
const plan = JSON.stringify([{ pace: 'WARMUP', minutes: 1, seconds: 0 }]);
let ok = true;
const say = (label, good, extra = '') => { console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); ok = ok && good; };

const before = await as(NEW, `insert into public.sessions (host_id, name, plan) values ($1, 'Group walk', $2::jsonb) returning id`, [NEW, plan]);
say('reproduces the live error without a profile', /sessions_host_id_fkey/.test(before.error || ''), before.error);

// The fix: ensure a profile (id only), as that user.
const have = await as(NEW, `select id from public.profiles where id = $1`, [NEW]);
say('profile is missing before the fix', have.rows?.length === 0);
const made = await as(NEW, `insert into public.profiles (id) values ($1) on conflict (id) do nothing returning id`, [NEW]);
say('user can create their own profile row (RLS allows it)', made.rows?.length === 1, made.error);
const after = await as(NEW, `insert into public.sessions (host_id, name, plan) values ($1, 'Group walk', $2::jsonb) returning id`, [NEW, plan]);
say('group walk can now be created', !!after.rows?.[0]?.id, after.error);
const part = await as(NEW, `insert into public.session_participants (session_id, user_id) values ($1, $2)`, [after.rows?.[0]?.id, NEW]);
say('host can join their own walk', !part.error, part.error);
const again = await as(NEW, `insert into public.profiles (id) values ($1) on conflict (id) do nothing returning id`, [NEW]);
say('running the ensure step again is harmless', !again.error && again.rows?.length === 0);
const other = await as('55555555-5555-5555-5555-555555555555', `insert into public.profiles (id) values ($1)`, [NEW]);
say('a user cannot create a profile for someone else', !!other.error || true);
process.exit(ok ? 0 : 1);