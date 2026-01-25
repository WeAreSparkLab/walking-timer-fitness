-- Fix Real-time Synchronization for Group Walks
-- Run this in Supabase SQL Editor

-- Step 1: Enable realtime for both tables (idempotent - safe to run multiple times)
DO $$
BEGIN
    -- Add session_progress if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'session_progress'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE session_progress;
        RAISE NOTICE 'Added session_progress to realtime publication';
    ELSE
        RAISE NOTICE 'session_progress already in realtime publication';
    END IF;

    -- Add sessions if not already in publication
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'sessions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
        RAISE NOTICE 'Added sessions to realtime publication';
    ELSE
        RAISE NOTICE 'sessions already in realtime publication';
    END IF;
END $$;

-- Step 2: Verify realtime is enabled (should show both tables)
SELECT schemaname, tablename 
FROM pg_publication_tables 
WHERE pubname = 'supabase_realtime';

-- Step 3: Grant necessary permissions for realtime
GRANT SELECT ON session_progress TO anon, authenticated;
GRANT SELECT ON sessions TO anon, authenticated;

-- Step 4: Ensure updated_at triggers exist for proper change tracking
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to sessions table
DROP TRIGGER IF EXISTS update_sessions_updated_at ON sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to session_progress table
DROP TRIGGER IF EXISTS update_session_progress_updated_at ON session_progress;
CREATE TRIGGER update_session_progress_updated_at
    BEFORE UPDATE ON session_progress
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Step 5: Verify the setup
SELECT 
    'Setup complete! Verify in Supabase Dashboard:' as message,
    '1. Database > Replication > Both tables should be checked' as step1,
    '2. Test by updating a session and checking the realtime logs' as step2;
