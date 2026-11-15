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

// find_people: usernames by prefix, emails by exact match only, never any email back.
await db.query(`update auth.users set email = 'sara@example.com' where id = $1`, [HOST]);
await db.query(`update auth.users set email = 'friend@example.com' where id = $1`, [FRIEND]);
await db.query(`update public.profiles set username = 'sara_walks' where id = $1`, [HOST]);
await db.query(`update public.profiles set username = 'friendly' where id = $1`, [FRIEND]);
await db.query(`update public.profiles set username = null where id = $1`, [STRANGER]); // no username yet
await db.query(`update auth.users set email = 'quiet@example.com' where id = $1`, [STRANGER]);

let ok = true;
const say = (label, good, extra = '') => { console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); ok = ok && good; };
const names = r => (r.rows || []).map(x => x.username ?? '(no username)').join(',');

let r = await as(HOST, `select * from public.find_people('frie')`);
say('username prefix finds the person', names(r) === 'friendly', names(r) + (r.error || ''));
r = await as(HOST, `select * from public.find_people('FRIE')`);
say('username search ignores capital letters', names(r) === 'friendly');
r = await as(HOST, `select * from public.find_people('riend')`);
say('middle of a username does not match', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('fr')`);
say('fewer than 3 letters returns nothing', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('friend@example.com')`);
say('complete email finds the person', names(r) === 'friendly');
r = await as(HOST, `select * from public.find_people('quiet@example.com')`);
say('email finds someone who has no username yet', (r.rows || []).length === 1 && r.rows[0].username === null);
r = await as(HOST, `select * from public.find_people('friend@example')`);
say('partial email returns nothing', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('@example.com')`);
say('domain-only search returns nothing', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('sara@example.com')`);
say('you never find yourself', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('%%%')`);
say('wildcard characters are not wildcards', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('fri_ndly')`);
say('underscore is not a wildcard', (r.rows || []).length === 0);
r = await as(HOST, `select * from public.find_people('friend@example.com')`);
say('results contain no email column', !('email' in (r.rows?.[0] || {})) && Object.keys(r.rows?.[0] || {}).sort().join() === 'avatar_url,id,username');
await db.exec('reset role'); await db.exec('set role anon');
let anonErr; try { await db.query(`select * from public.find_people('friend@example.com')`); } catch (e) { anonErr = e.message; }
await db.exec('reset role');
say('signed-out visitors cannot search', !!anonErr, anonErr);
process.exit(ok ? 0 : 1);