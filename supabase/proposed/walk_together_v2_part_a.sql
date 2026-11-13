-- PART A — ADDITIVE ONLY. Safe to run while the current app is live.
-- Walk Together v2: shared timeline, readiness, expiring invitations, host controls.
-- Additive only: no columns or tables are dropped, so the current live app
-- keeps working while the new one rolls out.

begin;

-- 1. Shared timeline on the session --------------------------------------
-- Every phone computes the current phase from these server timestamps,
-- instead of copying a "time remaining" number from the host every 2s.
alter table public.sessions
  add column if not exists started_at      timestamptz,          -- when part 1 begins (includes the countdown)
  add column if not exists paused_at       timestamptz,          -- set while the host has paused
  add column if not exists paused_total_ms bigint not null default 0,
  add column if not exists ends_at         timestamptz;          -- for expiry and "walk complete"

-- 2. Readiness in the lobby ------------------------------------------------
alter table public.session_participants
  add column if not exists ready boolean not null default false;

-- 3. Expiring invitations --------------------------------------------------
alter table public.session_invites
  add column if not exists expires_at timestamptz not null default now() + interval '7 days';

-- 4. Server clock, so devices with wrong clocks still agree -----------------
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now() $$;

-- 5. Host controls (server time, host only) -------------------------------
create or replace function public.start_walk(p_session uuid, p_countdown_seconds int default 10)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare s public.sessions; total_ms bigint;
begin
  if not walking_private.is_session_host(p_session) then raise exception 'Only the host can start this walk'; end if;
  select coalesce(sum(((i->>'minutes')::int * 60 + (i->>'seconds')::int) * 1000), 0) into total_ms
    from public.sessions, jsonb_array_elements(plan) i where id = p_session;
  update public.sessions
     set started_at = now() + make_interval(secs => greatest(3, least(p_countdown_seconds, 30))),
         paused_at = null, paused_total_ms = 0, status = 'active',
         ends_at = now() + make_interval(secs => greatest(3, least(p_countdown_seconds, 30))) + (total_ms || ' milliseconds')::interval
   where id = p_session returning * into s;
  return s;
end $$;

create or replace function public.pause_walk(p_session uuid)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  if not walking_private.is_session_host(p_session) then raise exception 'Only the host can pause this walk'; end if;
  update public.sessions set paused_at = now()
   where id = p_session and status = 'active' and paused_at is null returning * into s;
  return s;
end $$;

create or replace function public.resume_walk(p_session uuid)
returns public.sessions language plpgsql security definer set search_path = '' as $$
declare s public.sessions; gap bigint;
begin
  if not walking_private.is_session_host(p_session) then raise exception 'Only the host can resume this walk'; end if;
  select (extract(epoch from (now() - paused_at)) * 1000)::bigint into gap from public.sessions where id = p_session and paused_at is not null;
  if gap is null then select * into s from public.sessions where id = p_session; return s; end if;
  update public.sessions
     set paused_total_ms = paused_total_ms + gap, paused_at = null,
         ends_at = ends_at + (gap || ' milliseconds')::interval
   where id = p_session returning * into s;
  return s;
end $$;

-- 6. Joining only with a valid invitation ---------------------------------
-- Preview what you are joining without exposing anyone's private profile.
create or replace function public.preview_invite(p_token text)
returns table (session_id uuid, walk_name text, plan jsonb, host_name text, walkers int, expired boolean)
language sql stable security definer set search_path = '' as $$
  select s.id, s.name, s.plan, p.username,
         (select count(*)::int from public.session_participants sp where sp.session_id = s.id),
         i.expires_at < now() or s.status in ('completed', 'cancelled')
    from public.session_invites i
    join public.sessions s on s.id = i.session_id
    join public.profiles p on p.id = s.host_id
   where i.token = p_token;
$$;

create or replace function public.redeem_invite(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sid uuid;
begin
  select i.session_id into sid from public.session_invites i
    join public.sessions s on s.id = i.session_id
   where i.token = p_token and i.expires_at > now() and s.status not in ('completed', 'cancelled');
  if sid is null then raise exception 'This invitation has expired or is no longer valid'; end if;
  insert into public.session_participants (session_id, user_id) values (sid, (select auth.uid()))
    on conflict do nothing;
  return sid;
end $$;

-- Host can issue a fresh link (old link stops working).
create or replace function public.rotate_invite(p_session uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare t text;
begin
  if not walking_private.is_session_host(p_session) then raise exception 'Only the host can change the invitation'; end if;
  insert into public.session_invites (session_id, token, expires_at)
       values (p_session, replace(gen_random_uuid()::text, '-', ''), now() + interval '7 days')
  on conflict (session_id) do update set token = excluded.token, expires_at = excluded.expires_at
  returning token into t;
  return t;
end $$;

grant execute on function public.server_now(), public.start_walk(uuid, int), public.pause_walk(uuid),
  public.resume_walk(uuid), public.preview_invite(text), public.redeem_invite(text), public.rotate_invite(uuid)
  to authenticated;

commit;
