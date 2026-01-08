-- Fix infinite recursion in RLS policies
-- Run this in Supabase SQL Editor to replace the problematic policies

-- Drop all existing policies first (both old and new names)
DROP POLICY IF EXISTS "Participants can view sessions" ON sessions;
DROP POLICY IF EXISTS "Host can create session" ON sessions;
DROP POLICY IF EXISTS "Host can update session" ON sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions they host" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions they joined" ON sessions;
DROP POLICY IF EXISTS "Hosts can update their sessions" ON sessions;

DROP POLICY IF EXISTS "Users can join sessions" ON session_participants;
DROP POLICY IF EXISTS "Participants can view" ON session_participants;
DROP POLICY IF EXISTS "Users can view all participants in their sessions" ON session_participants;

DROP POLICY IF EXISTS "Host can create invites" ON session_invites;
DROP POLICY IF EXISTS "Anyone can read invites" ON session_invites;
DROP POLICY IF EXISTS "Hosts can create invites" ON session_invites;
DROP POLICY IF EXISTS "Hosts can update invites" ON session_invites;
DROP POLICY IF EXISTS "Anyone can read invites to join" ON session_invites;

DROP POLICY IF EXISTS "Participants can send messages" ON session_messages;
DROP POLICY IF EXISTS "Participants can read messages" ON session_messages;

DROP POLICY IF EXISTS "Users can update own progress" ON session_progress;
DROP POLICY IF EXISTS "Participants can read progress" ON session_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON session_progress;
DROP POLICY IF EXISTS "Users can update their progress" ON session_progress;
DROP POLICY IF EXISTS "Participants can read all progress" ON session_progress;

-- Sessions policies (fixed - no circular reference)
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

-- Friendships policies (if not already set)
DROP POLICY IF EXISTS "Users can send friend requests" ON friendships;
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
DROP POLICY IF EXISTS "Users can update friend requests they received" ON friendships;

CREATE POLICY "Users can send friend requests" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can view their friendships" ON friendships
  FOR SELECT USING (
    auth.uid() = requester_id OR auth.uid() = addressee_id
  );

CREATE POLICY "Users can update friend requests they received" ON friendships
  FOR UPDATE USING (auth.uid() = addressee_id);
