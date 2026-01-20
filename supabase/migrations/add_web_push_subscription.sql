-- Add web_push_subscription to profiles for browser notifications
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS web_push_subscription JSONB;

-- Comment
COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API subscription object for browser notifications';
