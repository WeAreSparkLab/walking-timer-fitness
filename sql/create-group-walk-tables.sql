-- Group Walk Tables for Supabase
-- Run this in your Supabase SQL Editor

-- Sessions table (may already exist)
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  name text,
  plan jsonb NOT NULL, -- Array of {pace, minutes, seconds}
  start_time timestamptz,
  status text CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')) DEFAULT 'scheduled',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Session participants
CREATE TABLE IF NOT EXISTS session_participants (
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text CHECK (role IN ('host', 'member')) DEFAULT 'member',
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- Session invites (shareable tokens)
CREATE TABLE IF NOT EXISTS session_invites (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  token text UNIQUE DEFAULT encode(gen_random_bytes(16), 'base64'),
  created_at timestamptz DEFAULT now()
);

-- Session messages (chat during walk)
CREATE TABLE IF NOT EXISTS session_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  text text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Real-time progress tracking for each participant
CREATE TABLE IF NOT EXISTS session_progress (
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  current_interval int DEFAULT 0,
  interval_time_remaining int DEFAULT 0,
  is_paused boolean DEFAULT false,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (session_id, user_id)
);

-- Friendships table (may already exist)
CREATE TABLE IF NOT EXISTS friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  addressee_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  status text CHECK (status IN ('pending', 'accepted', 'blocked')) DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

-- RLS Policies
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;

-- Sessions policies (fixed - no circular reference)
DROP POLICY IF EXISTS "Participants can view sessions" ON sessions;
DROP POLICY IF EXISTS "Host can create session" ON sessions;
DROP POLICY IF EXISTS "Host can update session" ON sessions;

CREATE POLICY "Users can create sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Users can view sessions they host" ON sessions
  FOR SELECT USING (auth.uid() = host_id);

CREATE POLICY "Users can view sessions they joined" ON sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM session_participants 
      WHERE session_participants.session_id = sessions.id 
      AND session_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can update their sessions" ON sessions
  FOR UPDATE USING (auth.uid() = host_id);

-- Session participants policies (simplified)
DROP POLICY IF EXISTS "Users can join sessions" ON session_participants;
DROP POLICY IF EXISTS "Participants can view" ON session_participants;

CREATE POLICY "Users can join sessions" ON session_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view all participants in their sessions" ON session_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = session_participants.session_id
      AND sp.user_id = auth.uid()
    )
  );

-- Session invites policies
DROP POLICY IF EXISTS "Host can create invites" ON session_invites;
DROP POLICY IF EXISTS "Anyone can view invites" ON session_invites;

CREATE POLICY "Hosts can create invites" ON session_invites
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = session_invites.session_id 
      AND sessions.host_id = auth.uid()
    )
  );

CREATE POLICY "Hosts can update invites" ON session_invites
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM sessions 
      WHERE sessions.id = session_invites.session_id 
      AND sessions.host_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can read invites to join" ON session_invites
  FOR SELECT USING (true);

-- Session messages policies
DROP POLICY IF EXISTS "Participants can send messages" ON session_messages;
DROP POLICY IF EXISTS "Participants can view messages" ON session_messages;

CREATE POLICY "Participants can send messages" ON session_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM session_participants 
      WHERE session_participants.session_id = session_messages.session_id 
      AND session_participants.user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can read messages" ON session_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM session_participants 
      WHERE session_participants.session_id = session_messages.session_id 
      AND session_participants.user_id = auth.uid()
    )
  );

-- Session progress policies
DROP POLICY IF EXISTS "Users can update own progress" ON session_progress;
DROP POLICY IF EXISTS "Participants can view all progress" ON session_progress;

CREATE POLICY "Users can update their own progress" ON session_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their progress" ON session_progress
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Participants can read all progress" ON session_progress
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM session_participants 
      WHERE session_participants.session_id = session_progress.session_id 
      AND session_participants.user_id = auth.uid()
    )
  );

-- Friendships: users can manage their own
DROP POLICY IF EXISTS "Users can send friend requests" ON friendships;
CREATE POLICY "Users can send friend requests" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Users can view friendships" ON friendships;
CREATE POLICY "Users can view friendships" ON friendships
  FOR SELECT USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

DROP POLICY IF EXISTS "Users can update friendships" ON friendships;
CREATE POLICY "Users can update friendships" ON friendships
  FOR UPDATE USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_participants_user ON session_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_session ON session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_progress_session ON session_progress(session_id);
CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_friendships_users ON friendships(requester_id, addressee_id);

-- Enable realtime for session_progress
ALTER PUBLICATION supabase_realtime ADD TABLE session_progress;
