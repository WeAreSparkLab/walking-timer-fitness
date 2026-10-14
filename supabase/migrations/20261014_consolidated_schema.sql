-- Consolidated schema for walking-timer-fitness.
-- Replaces the scattered patch files in /sql. Safe to run on an empty `public` schema.
-- Security model: RLS on every table, no anonymous access, signed-in users only.

-- ---------------------------------------------------------------------------
-- Private helper schema (not exposed through the API)
-- ---------------------------------------------------------------------------
create schema if not exists walking_private;
revoke all on schema walking_private from public, anon;
grant usage on schema walking_private to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text,
  email text,
  avatar_url text,
  bio text,
  push_token text,
  web_push_subscription jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  plan jsonb not null,                       -- array of {pace, minutes, seconds}
  start_time timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'active', 'completed', 'cancelled')),
  current_interval integer not null default 0,
  time_remaining integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.session_participants (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('host', 'member')),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.session_invites (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.session_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table public.session_progress (
  session_id uuid not null references public.sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  current_interval integer not null default 0,
  interval_time_remaining integer not null default 0,
  is_paused boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  data jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null default 'walk',
  duration_seconds integer not null check (duration_seconds >= 0),
  intervals_completed integer not null default 0,
  session_id uuid references public.sessions(id) on delete set null,
  completed_at timestamptz not null default now(),
  points integer not null default 0 check (points >= 0)
);

create table public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_points integer not null default 0,
  total_walks integer not null default 0,
  total_duration_seconds integer not null default 0,
  current_streak_days integer not null default 0,
  longest_streak_days integer not null default 0,
  last_activity_date date,
  updated_at timestamptz not null default now()
);

create table public.fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token text not null,
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index on public.session_participants (user_id);
create index on public.session_messages (session_id, created_at);
create index on public.session_progress (session_id);
create index on public.sessions (status);
create index on public.sessions (host_id);
create index on public.friendships (addressee_id);
create index on public.direct_messages (sender_id, recipient_id, created_at desc);
create index on public.direct_messages (recipient_id);
create index on public.notifications (user_id, read, created_at desc);
create index on public.user_activities (user_id, completed_at desc);
create index on public.user_stats (total_points desc);
create index on public.fcm_tokens (user_id);
create index on public.profiles (username);

-- ---------------------------------------------------------------------------
-- Helper + trigger functions (private schema, never callable through the API)
-- ---------------------------------------------------------------------------
create function walking_private.is_session_member(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.session_participants
    where session_id = p_session and user_id = (select auth.uid())
  );
$$;

create function walking_private.is_session_host(p_session uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.sessions
    where id = p_session and host_id = (select auth.uid())
  );
$$;

create function walking_private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keeps user_stats in step with user_activities, so clients never write stats directly.
create function walking_private.update_user_stats_on_activity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  d date := (new.completed_at at time zone 'utc')::date;
  s public.user_stats%rowtype;
  new_streak integer;
begin
  select * into s from public.user_stats where user_id = new.user_id;

  if not found then
    insert into public.user_stats
      (user_id, total_points, total_walks, total_duration_seconds,
       current_streak_days, longest_streak_days, last_activity_date)
    values (new.user_id, new.points, 1, new.duration_seconds, 1, 1, d);
  else
    new_streak := case
      when s.last_activity_date = d then s.current_streak_days
      when s.last_activity_date = d - 1 then s.current_streak_days + 1
      when s.last_activity_date is null or d > s.last_activity_date then 1
      else s.current_streak_days
    end;
    update public.user_stats set
      total_points = total_points + new.points,
      total_walks = total_walks + 1,
      total_duration_seconds = total_duration_seconds + new.duration_seconds,
      current_streak_days = new_streak,
      longest_streak_days = greatest(longest_streak_days, new_streak),
      last_activity_date = greatest(coalesce(last_activity_date, d), d),
      updated_at = now()
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

revoke execute on all functions in schema walking_private from public, anon;
grant execute on function walking_private.is_session_member(uuid) to authenticated;
grant execute on function walking_private.is_session_host(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create trigger touch_profiles before update on public.profiles
  for each row execute function walking_private.touch_updated_at();
create trigger touch_sessions before update on public.sessions
  for each row execute function walking_private.touch_updated_at();
create trigger touch_session_progress before update on public.session_progress
  for each row execute function walking_private.touch_updated_at();
create trigger touch_friendships before update on public.friendships
  for each row execute function walking_private.touch_updated_at();
create trigger update_user_stats after insert on public.user_activities
  for each row execute function walking_private.update_user_stats_on_activity();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.session_participants enable row level security;
alter table public.session_invites enable row level security;
alter table public.session_messages enable row level security;
alter table public.session_progress enable row level security;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.user_activities enable row level security;
alter table public.user_stats enable row level security;
alter table public.fcm_tokens enable row level security;

-- No anonymous access to anything in this app.
revoke all on all tables in schema public from anon;

-- profiles: signed-in users can look each other up (friend search, leaderboard); edit only their own.
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- sessions: visible to signed-in users (needed to join from an invite link); only the host changes them.
create policy sessions_select on public.sessions for select to authenticated using (true);
create policy sessions_insert on public.sessions for insert to authenticated
  with check (host_id = (select auth.uid()));
create policy sessions_update on public.sessions for update to authenticated
  using (host_id = (select auth.uid())) with check (host_id = (select auth.uid()));
create policy sessions_delete on public.sessions for delete to authenticated
  using (host_id = (select auth.uid()));

-- participants: anyone signed in can see who is in a walk; you join/leave as yourself; hosts can remove people.
create policy participants_select on public.session_participants for select to authenticated using (true);
create policy participants_insert on public.session_participants for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy participants_update on public.session_participants for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy participants_delete on public.session_participants for delete to authenticated
  using (user_id = (select auth.uid()) or walking_private.is_session_host(session_id));

-- invites: tokens are readable by signed-in users (join flow); only the host creates/changes them.
create policy invites_select on public.session_invites for select to authenticated using (true);
create policy invites_insert on public.session_invites for insert to authenticated
  with check (walking_private.is_session_host(session_id));
create policy invites_update on public.session_invites for update to authenticated
  using (walking_private.is_session_host(session_id))
  with check (walking_private.is_session_host(session_id));

-- group chat + live progress: participants only.
create policy session_messages_select on public.session_messages for select to authenticated
  using (walking_private.is_session_member(session_id));
create policy session_messages_insert on public.session_messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and walking_private.is_session_member(session_id));

create policy progress_select on public.session_progress for select to authenticated
  using (walking_private.is_session_member(session_id));
create policy progress_insert on public.session_progress for insert to authenticated
  with check (user_id = (select auth.uid()) and walking_private.is_session_member(session_id));
create policy progress_update on public.session_progress for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy progress_delete on public.session_progress for delete to authenticated
  using (user_id = (select auth.uid()));

-- friendships: only the two people involved.
create policy friendships_select on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_insert on public.friendships for insert to authenticated
  with check (requester_id = (select auth.uid()));
create policy friendships_update on public.friendships for update to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id))
  with check ((select auth.uid()) in (requester_id, addressee_id));
create policy friendships_delete on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester_id, addressee_id));

-- direct messages: only sender and recipient; only the recipient marks as read.
create policy dm_select on public.direct_messages for select to authenticated
  using ((select auth.uid()) in (sender_id, recipient_id));
create policy dm_insert on public.direct_messages for insert to authenticated
  with check (sender_id = (select auth.uid()));
create policy dm_update on public.direct_messages for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

-- notifications: you read/update/delete your own; the app creates them for friends, so any signed-in user may insert.
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_insert on public.notifications for insert to authenticated
  with check (true);
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- activities + stats: readable by signed-in users (leaderboard); you record only your own activities.
-- user_stats has no write policy on purpose: the trigger above maintains it.
create policy activities_select on public.user_activities for select to authenticated using (true);
create policy activities_insert on public.user_activities for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy stats_select on public.user_stats for select to authenticated using (true);

-- push tokens: your own only (the edge function uses the service role, which bypasses RLS).
create policy fcm_select on public.fcm_tokens for select to authenticated
  using (user_id = (select auth.uid()));
create policy fcm_insert on public.fcm_tokens for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy fcm_update on public.fcm_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fcm_delete on public.fcm_tokens for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Avatars storage: public read via URL, but you can only write files named "<your user id>-...".
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '-%');
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and name like (select auth.uid())::text || '-%');
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '-%')
  with check (bucket_id = 'avatars' and name like (select auth.uid())::text || '-%');
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and name like (select auth.uid())::text || '-%');

-- ---------------------------------------------------------------------------
-- Realtime (tables the app subscribes to)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sessions', 'session_progress', 'session_messages',
                           'notifications', 'friendships', 'direct_messages']
  loop
    if not exists (select 1 from pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
