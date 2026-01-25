-- Create notifications table for in-app notifications
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see their own notifications
DROP POLICY IF EXISTS "Users can view own notifications" ON notifications;
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own notifications" ON notifications;
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- Enable realtime for notifications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
        RAISE NOTICE 'Added notifications to realtime publication';
    ELSE
        RAISE NOTICE 'notifications already in realtime publication';
    END IF;
END $$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON notifications TO anon, authenticated;

-- Verify
SELECT 
    'Notifications table created!' as message,
    'Check: SELECT * FROM notifications LIMIT 1' as test_query;
