-- Safe in-app notifications. Run in the Supabase SQL editor. Additive; safe to re-run.
--
-- Today any signed-in user can create a notification for ANYONE (the rule is "true"), so a
-- stranger could send you a fake invitation. This:
--   1. adds notify_friend(): lets you notify only your accepted friends, and only with the
--      kinds the app uses (walk_invite, friend_accepted), and
--   2. tightens the table so people can only create notifications for themselves directly.
-- Friend requests need no notification row: the app counts them straight from friendships.

begin;

create or replace function public.notify_friend(p_user uuid, p_type text, p_title text, p_message text, p_data jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'Not signed in'; end if;
  if p_type not in ('walk_invite', 'friend_accepted') then raise exception 'That kind of notification is not allowed'; end if;
  if not exists (
    select 1 from public.friendships f
     where f.status = 'accepted'
       and ((f.requester_id = me and f.addressee_id = p_user) or (f.addressee_id = me and f.requester_id = p_user))
  ) then raise exception 'You can only notify your friends'; end if;
  insert into public.notifications (user_id, type, title, message, data)
  values (p_user, p_type, left(coalesce(p_title, ''), 120), left(coalesce(p_message, ''), 300), coalesce(p_data, '{}'::jsonb));
end $$;

revoke execute on function public.notify_friend(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.notify_friend(uuid, text, text, text, jsonb) to authenticated;

drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert to authenticated
  with check (user_id = (select auth.uid()));

commit;