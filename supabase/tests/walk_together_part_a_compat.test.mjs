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

let ok = true;
const plan = JSON.stringify([{ pace: 'WARMUP', minutes: 1, seconds: 0 }]);
const sid = (await as(HOST, `insert into public.sessions (host_id, name, plan) values ($1, 'Old app walk', $2::jsonb) returning id`, [HOST, plan])).rows[0].id;
const a = await as(HOST, `insert into public.session_participants (session_id, user_id) values ($1, $2)`, [sid, HOST]);
const b = await as(HOST, `insert into public.session_invites (session_id) values ($1) returning token, expires_at`, [sid]);
const c = await as(FRIEND, `select session_id from public.session_invites where token = $1`, [b.rows?.[0]?.token]);
const d = await as(FRIEND, `insert into public.session_participants (session_id, user_id) values ($1, $2)`, [sid, FRIEND]);
const e = await as(HOST, `update public.sessions set status='active', current_interval=1, time_remaining=30 where id=$1 returning id`, [sid]);
for (const [label, r, good] of [['old: host creates walk + joins', a, !a.error], ['old: invite created (gets 7-day expiry)', b, !!b.rows?.[0]?.expires_at], ['old: friend reads token', c, c.rows?.length === 1], ['old: friend joins directly', d, !d.error], ['old: host timer sync update', e, e.rows?.length === 1]]) {
  console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${r.error ? ' — ' + r.error : ''}`); ok = ok && good;
}
process.exit(ok ? 0 : 1);