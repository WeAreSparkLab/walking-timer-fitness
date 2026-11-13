-- PART B — SECURITY TIGHTENING. Run at the same moment the new app goes live
-- (the current live app joins walks in a way these rules block).
-- Requires Part A.

begin;

-- 7. Tighten row-level security -------------------------------------------
-- Walks, their walkers and invitation tokens are visible only to members.
drop policy if exists sessions_select on public.sessions;
create policy sessions_select on public.sessions for select to authenticated
  using (host_id = (select auth.uid()) or walking_private.is_session_member(id));

drop policy if exists participants_select on public.session_participants;
create policy participants_select on public.session_participants for select to authenticated
  using (walking_private.is_session_member(session_id));

-- Direct inserts only for the host adding themselves; everyone else joins via redeem_invite().
drop policy if exists participants_insert on public.session_participants;
create policy participants_insert on public.session_participants for insert to authenticated
  with check (user_id = (select auth.uid()) and walking_private.is_session_host(session_id));

drop policy if exists invites_select on public.session_invites;
create policy invites_select on public.session_invites for select to authenticated
  using (walking_private.is_session_host(session_id));

commit;
