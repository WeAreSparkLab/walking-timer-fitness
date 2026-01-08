-- Complete RLS policy fix - removes ALL circular dependencies
-- Run this in Supabase SQL Editor

-- ===== SESSIONS TABLE =====
-- Drop all session policies
DROP POLICY IF EXISTS "Participants can view sessions" ON sessions;
DROP POLICY IF EXISTS "Host can create session" ON sessions;
DROP POLICY IF EXISTS "Host can update session" ON sessions;
DROP POLICY IF EXISTS "Users can create sessions" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions they host" ON sessions;
DROP POLICY IF EXISTS "Users can view sessions they joined" ON sessions;
DROP POLICY IF EXISTS "Hosts can update their sessions" ON sessions;

-- Simple session policies (NO references to session_participants)
CREATE POLICY "Anyone can create sessions" ON sessions
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Anyone can view any session" ON sessions
  FOR SELECT USING (true);

CREATE POLICY "Host can update session" ON sessions
  FOR UPDATE USING (auth.uid() = host_id);

-- ===== SESSION_PARTICIPANTS TABLE =====
DROP POLICY IF EXISTS "Users can join sessions" ON session_participants;
DROP POLICY IF EXISTS "Participants can view" ON session_participants;
DROP POLICY IF EXISTS "Users can view all participants in their sessions" ON session_participants;

CREATE POLICY "Anyone can join sessions" ON session_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Anyone can view participants" ON session_participants
  FOR SELECT USING (true);

-- ===== SESSION_INVITES TABLE =====
DROP POLICY IF EXISTS "Host can create invites" ON session_invites;
DROP POLICY IF EXISTS "Anyone can read invites" ON session_invites;
DROP POLICY IF EXISTS "Hosts can create invites" ON session_invites;
DROP POLICY IF EXISTS "Hosts can update invites" ON session_invites;
DROP POLICY IF EXISTS "Anyone can read invites to join" ON session_invites;

CREATE POLICY "Anyone can create invites" ON session_invites
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update invites" ON session_invites
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can read invites" ON session_invites
  FOR SELECT USING (true);

-- ===== SESSION_MESSAGES TABLE =====
DROP POLICY IF EXISTS "Participants can send messages" ON session_messages;
DROP POLICY IF EXISTS "Participants can read messages" ON session_messages;

CREATE POLICY "Anyone can send messages" ON session_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Anyone can read messages" ON session_messages
  FOR SELECT USING (true);

-- ===== SESSION_PROGRESS TABLE =====
DROP POLICY IF EXISTS "Users can update own progress" ON session_progress;
DROP POLICY IF EXISTS "Participants can read progress" ON session_progress;
DROP POLICY IF EXISTS "Users can update their own progress" ON session_progress;
DROP POLICY IF EXISTS "Users can update their progress" ON session_progress;
DROP POLICY IF EXISTS "Participants can read all progress" ON session_progress;

CREATE POLICY "Users can manage own progress" ON session_progress
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read progress" ON session_progress
  FOR SELECT USING (true);

-- ===== FRIENDSHIPS TABLE =====
DROP POLICY IF EXISTS "Users can send friend requests" ON friendships;
DROP POLICY IF EXISTS "Users can view their friendships" ON friendships;
DROP POLICY IF EXISTS "Users can update friend requests they received" ON friendships;
DROP POLICY IF EXISTS "Users can send requests" ON friendships;
DROP POLICY IF EXISTS "Users can view friendships" ON friendships;
DROP POLICY IF EXISTS "Recipients can update requests" ON friendships;
DROP POLICY IF EXISTS "Users can update friendships" ON friendships;

CREATE POLICY "Users can send requests" ON friendships
  FOR INSERT WITH CHECK (auth.uid() = requester_id);

CREATE POLICY "Users can view friendships" ON friendships
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

CREATE POLICY "Recipients can update requests" ON friendships
  FOR UPDATE USING (auth.uid() = addressee_id);
