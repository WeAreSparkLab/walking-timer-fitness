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
const say = (label, good, extra = '') => { console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${extra ? ' - ' + extra : ''}`); ok = ok && good; };
for (const u of [HOST, FRIEND]) {
  const r = await as(u, `insert into public.user_activities (user_id, duration_seconds, intervals_completed, points) values ('${u}', 600, 3, 10)`);
  say('can record own walk', !r.error, r.error);
}
let r = await as(HOST, `insert into public.user_activities (user_id, duration_seconds, intervals_completed, points) values ('${FRIEND}', 600, 3, 10)`);
say('cannot record a walk for someone else', !!r.error);
r = await as(HOST, `select count(*)::int c from public.user_activities`);
say('only sees own walks', r.rows?.[0]?.c === 1, JSON.stringify(r.rows));
r = await as(HOST, `select count(*)::int c from public.user_stats`);
say('only sees own totals', r.rows?.[0]?.c === 1, JSON.stringify(r.rows));
r = await as(STRANGER, `select count(*)::int c from public.user_activities`);
say('someone with no walks sees nothing', r.rows?.[0]?.c === 0);
console.log(ok ? '\nALL PASSED' : '\nSOME FAILED'); process.exit(ok ? 0 : 1);