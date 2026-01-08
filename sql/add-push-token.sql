-- Add push_token column to profiles table for storing Expo push notification tokens
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Add index for faster lookups when sending notifications
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.push_token IS 'Expo push notification token for sending notifications to user devices';
