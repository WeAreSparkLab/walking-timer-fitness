-- Check if your group walk data exists
-- Run this in Supabase SQL Editor

-- 1. Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('sessions', 'session_participants', 'session_invites');

-- 2. Check your sessions (replace YOUR_USER_ID with your actual user ID from profiles table)
SELECT id, name, host_id, status, created_at 
FROM sessions 
ORDER BY created_at DESC 
LIMIT 10;

-- 3. Check session participants
SELECT sp.*, s.name as session_name
FROM session_participants sp
JOIN sessions s ON sp.session_id = s.id
ORDER BY sp.joined_at DESC
LIMIT 10;

-- 4. Find your user ID (check auth.users email)
SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;

-- 5. Check if you have any participants for your user
-- Replace 'YOUR_EMAIL@example.com' with your actual email
SELECT sp.*, s.name as session_name, s.created_at
FROM session_participants sp
JOIN sessions s ON sp.session_id = s.id
JOIN auth.users u ON sp.user_id = u.id
WHERE u.email = 'YOUR_EMAIL@example.com';
