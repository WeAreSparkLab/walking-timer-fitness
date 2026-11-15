-- Find a person to add as a friend — without exposing anyone's email address.
-- Run in the Supabase SQL editor. Additive and safe to re-run.
--
-- How people are found:
--   * by the START of a username (at least 3 letters), or
--   * by a COMPLETE email address (exact match only).
-- Only id, username and avatar are returned. An email address is never returned,
-- and there is no partial-email search, so nobody can list or guess at addresses.

begin;

create or replace function public.find_people(p_query text)
returns table (id uuid, username text, avatar_url text)
language plpgsql stable security definer set search_path = '' as $$
declare q text := lower(trim(coalesce(p_query, '')));
begin
  if (select auth.uid()) is null or length(q) < 3 then return; end if;

  if position('@' in q) > 0 then
    -- Exact email only.
    return query
      select p.id, p.username, p.avatar_url
        from auth.users u
        join public.profiles p on p.id = u.id
       where lower(u.email) = q
         and p.id <> (select auth.uid())
       limit 1;
  else
    -- Username starts with what was typed (wildcard characters are treated as plain text).
    return query
      select p.id, p.username, p.avatar_url
        from public.profiles p
       where p.username is not null
         and lower(p.username) like replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
         and p.id <> (select auth.uid())
       order by p.username
       limit 20;
  end if;
end $$;

revoke execute on function public.find_people(text) from public, anon;
grant execute on function public.find_people(text) to authenticated;

commit;