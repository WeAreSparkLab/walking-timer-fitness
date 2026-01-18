-- Add columns for real-time session control synchronization
-- Run this in Supabase SQL Editor

ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS current_interval integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_remaining integer DEFAULT 0;

-- Verify the columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'sessions' 
AND column_name IN ('current_interval', 'time_remaining');
