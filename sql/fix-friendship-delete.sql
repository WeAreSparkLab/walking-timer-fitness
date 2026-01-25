-- Fix friendships DELETE policy
-- Run this in Supabase SQL Editor

-- Add DELETE policy for friendships
-- Users can delete friendships where they are either the requester or addressee
DROP POLICY IF EXISTS "Users can delete friendships" ON friendships;

CREATE POLICY "Users can delete friendships" ON friendships
  FOR DELETE USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- Verify the policy was created
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE tablename = 'friendships';
