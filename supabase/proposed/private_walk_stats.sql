-- Make walking history private. Run once in the Supabase SQL editor (safe to re-run).
-- Until now every signed-in person could read everyone's walk history and totals.
-- After this, you can read only your own. (Inserts are unchanged: only for yourself.)

drop policy if exists activities_select on public.user_activities;
drop policy if exists stats_select on public.user_stats;

create policy activities_select on public.user_activities
  for select using (user_id = (select auth.uid()));

create policy stats_select on public.user_stats
  for select using (user_id = (select auth.uid()));
