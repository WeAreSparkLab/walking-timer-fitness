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
const say = (label, good, extra = '') => { console.log(`${good ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); ok = ok && good; };
const n = r => r.rows?.[0]?.n;

// Friend request: HOST asks FRIEND.
const fr = await as(HOST, `insert into public.friendships (requester_id, addressee_id) values ($1, $2) returning id`, [HOST, FRIEND]);
const fid = fr.rows?.[0]?.id;
say('a friend request can be sent', !!fid, fr.error);
say('the recipient sees 1 pending request (badge count)', n(await as(FRIEND, `select count(*)::int as n from public.friendships where addressee_id = $1 and status = 'pending'`, [FRIEND])) === 1);
say('the sender does not count it as waiting for them', n(await as(HOST, `select count(*)::int as n from public.friendships where addressee_id = $1 and status = 'pending'`, [HOST])) === 0);
say('a stranger sees no requests', n(await as(STRANGER, `select count(*)::int as n from public.friendships`)) === 0);
say('recipient can decline (delete) the request', (await as(FRIEND, `delete from public.friendships where id = $1 and addressee_id = $2 and status = 'pending' returning id`, [fid, FRIEND])).rows?.length === 1);
say('the sender cannot decline on the recipient’s behalf', (await as(HOST, `delete from public.friendships where addressee_id = $1`, [FRIEND])).rows?.length === 0);

// Request again, then accept; requester is told via a notification row.
const fr2 = await as(HOST, `insert into public.friendships (requester_id, addressee_id) values ($1, $2) returning id`, [HOST, FRIEND]);
const acc = await as(FRIEND, `update public.friendships set status = 'accepted' where id = $1 returning status`, [fr2.rows?.[0]?.id]);
say('recipient can accept', acc.rows?.[0]?.status === 'accepted', acc.error);
await db.exec(readFileSync(process.argv[4], 'utf8'));
const note = await as(FRIEND, `select public.notify_friend($1, 'friend_accepted', 'Friend request accepted', 'friend accepted your friend request!', '{}'::jsonb)`, [HOST]);
say('a friend can leave the accepted notice (via notify_friend)', !note.error, note.error);
say('requester sees 1 unread update (badge count)', n(await as(HOST, `select count(*)::int as n from public.notifications where user_id = $1 and read = false and type in ('walk_invite','friend_accepted')`, [HOST])) === 1);
say('a stranger cannot notify someone they are not friends with', !!(await as(STRANGER, `select public.notify_friend($1, 'walk_invite', 'Join me', 'x', '{}'::jsonb)`, [HOST])).error);
say('other kinds of notification are refused', !!(await as(FRIEND, `select public.notify_friend($1, 'phishing', 'Click here', 'x', '{}'::jsonb)`, [HOST])).error);
say('direct inserts for other people are now refused', !!(await as(STRANGER, `insert into public.notifications (user_id, type, title, message) values ($1, 'walk_invite', 'fake', 'fake')`, [HOST])).error);
say('people can still create their own notifications', !(await as(HOST, `insert into public.notifications (user_id, type, title, message) values ($1, 'note', 'mine', 'mine')`, [HOST])).error);
say('signed-out visitors cannot call it', await (async () => { await db.exec('reset role'); await db.exec('set role anon'); let e; try { await db.query(`select public.notify_friend($1, 'walk_invite', 'x', 'x')`, [HOST]); } catch (x) { e = x; } await db.exec('reset role'); return !!e; })());say('someone else cannot read it', n(await as(STRANGER, `select count(*)::int as n from public.notifications`)) === 0);
await as(HOST, `update public.notifications set read = true where user_id = $1`, [HOST]);
say('marking it read clears the count', n(await as(HOST, `select count(*)::int as n from public.notifications where user_id = $1 and read = false`, [HOST])) === 0);

// Friend messages: unread count and clearing.
await as(HOST, `insert into public.direct_messages (sender_id, recipient_id, text) values ($1, $2, 'hello')`, [HOST, FRIEND]);
await as(HOST, `insert into public.direct_messages (sender_id, recipient_id, text) values ($1, $2, 'you there?')`, [HOST, FRIEND]);
say('recipient sees 2 unread messages', n(await as(FRIEND, `select count(*)::int as n from public.direct_messages where recipient_id = $1 and read_at is null`, [FRIEND])) === 2);
say('stranger sees none of them', n(await as(STRANGER, `select count(*)::int as n from public.direct_messages`)) === 0);
await as(FRIEND, `update public.direct_messages set read_at = now() where recipient_id = $1 and sender_id = $2 and read_at is null`, [FRIEND, HOST]);
say('opening the chat clears the unread count', n(await as(FRIEND, `select count(*)::int as n from public.direct_messages where recipient_id = $1 and read_at is null`, [FRIEND])) === 0);
process.exit(ok ? 0 : 1);