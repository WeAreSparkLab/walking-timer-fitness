-- Blocking people. Run once in the Supabase SQL editor (safe to re-run).
-- A block is private to the person who made it. While it stands, neither of you
-- can send the other a friend request or a message, and any friendship is removed.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.user_blocks enable row level security;

drop policy if exists user_blocks_select on public.user_blocks;
drop policy if exists user_blocks_insert on public.user_blocks;
drop policy if exists user_blocks_delete on public.user_blocks;
-- You can only see and manage your own blocks; the other person can't tell.
create policy user_blocks_select on public.user_blocks for select using (blocker_id = auth.uid());
create policy user_blocks_insert on public.user_blocks for insert with check (blocker_id = auth.uid());
create policy user_blocks_delete on public.user_blocks for delete using (blocker_id = auth.uid());

-- True if either person has blocked the other.
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;
revoke all on function public.is_blocked_between(uuid, uuid) from public, anon;
grant execute on function public.is_blocked_between(uuid, uuid) to authenticated;

-- Block someone: records it and removes any friendship or pending request between you.
create or replace function public.block_user(target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if target is null or target = auth.uid() then raise exception 'invalid'; end if;
  insert into public.user_blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  delete from public.friendships
   where (requester_id = auth.uid() and addressee_id = target)
      or (requester_id = target and addressee_id = auth.uid());
end $$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

-- Stop requests and messages while a block stands (checked on the database, not just in the app).
create or replace function public.reject_blocked_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.requester_id, new.addressee_id) then raise exception 'blocked'; end if;
  return new;
end $$;

create or replace function public.reject_blocked_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_blocked_between(new.sender_id, new.recipient_id) then raise exception 'blocked'; end if;
  return new;
end $$;

drop trigger if exists friendships_block_check on public.friendships;
create trigger friendships_block_check before insert on public.friendships
  for each row execute function public.reject_blocked_friendship();
drop trigger if exists direct_messages_block_check on public.direct_messages;
create trigger direct_messages_block_check before insert on public.direct_messages
  for each row execute function public.reject_blocked_message();
