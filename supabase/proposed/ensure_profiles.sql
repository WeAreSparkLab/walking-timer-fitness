-- OPTIONAL — NOT APPLIED. Run in the Supabase SQL editor only if you want it.
-- The app now creates a missing profile itself (lib/api/profile.ts: ensureMyProfile),
-- so the live app does not need this. It is a belt-and-braces safeguard that:
--   1. gives every existing account that has no profile one (id only), and
--   2. gives every future sign-up a profile automatically.
-- Additive and safe to re-run. No emails are copied (profiles are readable by other signed-in users).

begin;

insert into public.profiles (id)
select u.id
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

create or replace function walking_private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function walking_private.handle_new_user();

commit;