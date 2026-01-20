-- Full Notification System Database Migration
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Add sync columns to sessions table (for real-time walk sync)
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS current_interval INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_remaining INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

-- 2. Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Allow system to insert notifications for any user
CREATE POLICY "System can insert notifications" ON notifications
  FOR INSERT WITH CHECK (true);

-- 3. Add web push subscription column to profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS web_push_subscription JSONB;

COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API subscription for browser notifications';
