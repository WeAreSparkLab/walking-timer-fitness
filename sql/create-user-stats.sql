-- Create user activities table to track completed walks
CREATE TABLE IF NOT EXISTS user_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  activity_type text NOT NULL DEFAULT 'walk', -- 'walk', 'group_walk', etc.
  duration_seconds integer NOT NULL, -- Total walk duration
  intervals_completed integer NOT NULL DEFAULT 0, -- Number of intervals completed
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL, -- Optional group walk reference
  completed_at timestamptz DEFAULT now(),
  points integer NOT NULL DEFAULT 0 -- Points earned for this activity
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_activities_user_id ON user_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activities_completed_at ON user_activities(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activities_user_date ON user_activities(user_id, completed_at DESC);

-- Create user stats summary table (for faster queries)
CREATE TABLE IF NOT EXISTS user_stats (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  total_points integer DEFAULT 0,
  total_walks integer DEFAULT 0,
  total_duration_seconds integer DEFAULT 0,
  current_streak_days integer DEFAULT 0,
  longest_streak_days integer DEFAULT 0,
  last_activity_date date,
  updated_at timestamptz DEFAULT now()
);

-- Disable RLS (matching other tables in your setup)
ALTER TABLE user_activities DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats DISABLE ROW LEVEL SECURITY;

-- Function to calculate points based on walk duration
-- 1 point per minute of walking
CREATE OR REPLACE FUNCTION calculate_walk_points(duration_seconds integer)
RETURNS integer AS $$
BEGIN
  RETURN GREATEST(1, duration_seconds / 60);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update user stats after activity insert
CREATE OR REPLACE FUNCTION update_user_stats_on_activity()
RETURNS TRIGGER AS $$
DECLARE
  activity_date date;
  previous_date date;
  current_streak integer;
BEGIN
  activity_date := DATE(NEW.completed_at);
  
  -- Insert or update user_stats
  INSERT INTO user_stats (
    user_id,
    total_points,
    total_walks,
    total_duration_seconds,
    current_streak_days,
    longest_streak_days,
    last_activity_date,
    updated_at
  )
  VALUES (
    NEW.user_id,
    NEW.points,
    1,
    NEW.duration_seconds,
    1,
    1,
    activity_date,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_points = user_stats.total_points + NEW.points,
    total_walks = user_stats.total_walks + 1,
    total_duration_seconds = user_stats.total_duration_seconds + NEW.duration_seconds,
    last_activity_date = activity_date,
    updated_at = NOW();
  
  -- Update streak logic
  SELECT last_activity_date INTO previous_date
  FROM user_stats
  WHERE user_id = NEW.user_id;
  
  IF previous_date IS NOT NULL THEN
    IF activity_date = previous_date THEN
      -- Same day, no change to streak
      NULL;
    ELSIF activity_date = previous_date + INTERVAL '1 day' THEN
      -- Next day, increment streak
      UPDATE user_stats
      SET 
        current_streak_days = current_streak_days + 1,
        longest_streak_days = GREATEST(longest_streak_days, current_streak_days + 1)
      WHERE user_id = NEW.user_id;
    ELSE
      -- Streak broken, reset to 1
      UPDATE user_stats
      SET current_streak_days = 1
      WHERE user_id = NEW.user_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update stats when activity is recorded
DROP TRIGGER IF EXISTS trigger_update_user_stats ON user_activities;
CREATE TRIGGER trigger_update_user_stats
  AFTER INSERT ON user_activities
  FOR EACH ROW
  EXECUTE FUNCTION update_user_stats_on_activity();
