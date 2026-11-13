-- Creates the fcm_tokens table for storing Firebase Cloud Messaging tokens
-- These are used to deliver push notifications to web browsers via FCM

create table if not exists public.fcm_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null,
  updated_at  timestamptz not null default now(),
  unique (user_id, token)
);

-- Index for fast lookup by user
create index if not exists fcm_tokens_user_id_idx on public.fcm_tokens(user_id);

-- RLS: each user can only read/write their own tokens
alter table public.fcm_tokens enable row level security;

create policy "Users can insert their own FCM tokens"
  on public.fcm_tokens for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own FCM tokens"
  on public.fcm_tokens for update
  using (auth.uid() = user_id);

create policy "Users can delete their own FCM tokens"
  on public.fcm_tokens for delete
  using (auth.uid() = user_id);

create policy "Users can view their own FCM tokens"
  on public.fcm_tokens for select
  using (auth.uid() = user_id);

-- Service role may read all tokens (used by Edge Function)
create policy "Service role can read all FCM tokens"
  on public.fcm_tokens for select
  to service_role
  using (true);
