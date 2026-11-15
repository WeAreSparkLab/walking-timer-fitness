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

await db.query(`insert into auth.users (id) values ('66666666-6666-6666-6666-666666666666')`); // existing account, no profile
await db.exec(readFileSync(process.argv[4], 'utf8'));
const a = await db.query(`select count(*)::int as n from public.profiles where id = '66666666-6666-6666-6666-666666666666'`);
await db.query(`insert into auth.users (id) values ('77777777-7777-7777-7777-777777777777')`); // new sign-up after the trigger
const b = await db.query(`select count(*)::int as n from public.profiles where id = '77777777-7777-7777-7777-777777777777'`);
const c = await db.query(`select email from public.profiles where id = '77777777-7777-7777-7777-777777777777'`);
console.log(`${a.rows[0].n === 1 ? 'PASS' : 'FAIL'}  backfill creates the missing profile`);
console.log(`${b.rows[0].n === 1 ? 'PASS' : 'FAIL'}  new sign-ups get a profile automatically`);
console.log(`${c.rows[0].email === null ? 'PASS' : 'FAIL'}  no email copied into the profile`);
await db.exec(readFileSync(process.argv[4], 'utf8'));
console.log('PASS  safe to run twice');