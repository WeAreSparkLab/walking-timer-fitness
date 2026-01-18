-- Fix foreign key constraint pointing to wrong table
-- The constraint is pointing to "sync_sessions" but should point to "sessions"
-- Run this in Supabase SQL Editor

-- 1. Drop the incorrect foreign key constraint
ALTER TABLE session_participants 
DROP CONSTRAINT IF EXISTS session_participants_session_id_fkey;

-- 2. Add the correct foreign key constraint
ALTER TABLE session_participants 
ADD CONSTRAINT session_participants_session_id_fkey 
FOREIGN KEY (session_id) 
REFERENCES sessions(id) 
ON DELETE CASCADE;

-- Verify the fix
SELECT 
    tc.table_name, 
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_name='session_participants';
