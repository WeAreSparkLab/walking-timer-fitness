-- TEMPORARY: Disable RLS to get app working
-- Run this in Supabase SQL Editor
-- WARNING: This removes all security - only for development/testing

ALTER TABLE sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE session_progress DISABLE ROW LEVEL SECURITY;

-- Keep friendships secure
-- (friendships policies don't have circular issues)
