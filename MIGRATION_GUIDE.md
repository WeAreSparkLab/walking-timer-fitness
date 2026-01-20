# Sync Walk Fix - Database Migration

## What was wrong?
The `sessions` table was missing `current_interval` and `time_remaining` columns needed for real-time timer synchronization between the host and participants.

## How to fix it:

### Option 1: Using Supabase Dashboard (Easiest)
1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **SQL Editor**
4. Copy and paste the content from `supabase/migrations/add_session_sync_columns.sql`
5. Click **Run**

### Option 2: Using Supabase CLI
```bash
# If you have supabase CLI installed
supabase db reset

# Or apply just this migration
psql <your-connection-string> < supabase/migrations/add_session_sync_columns.sql
```

## What this adds:
- `current_interval` (INTEGER) - Tracks which interval the timer is on
- `time_remaining` (INTEGER) - Tracks seconds left in current interval
- Index on `status` column for faster queries

## After running the migration:
The sync walk feature will work! When the host:
- Starts/pauses the timer
- Changes intervals
- Updates time

All participants will see the updates in real-time automatically.
