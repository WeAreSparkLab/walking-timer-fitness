-- Add columns for real-time session synchronization
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS current_interval INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_remaining INTEGER DEFAULT 0;

-- Add index for faster real-time updates
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- Comment on columns
COMMENT ON COLUMN sessions.current_interval IS 'Current interval index for syncing timer across participants';
COMMENT ON COLUMN sessions.time_remaining IS 'Remaining seconds in current interval for syncing timer';
