-- Add role column to session_participants if it doesn't exist
-- Run this in Supabase SQL Editor

ALTER TABLE session_participants 
ADD COLUMN IF NOT EXISTS role text CHECK (role IN ('host', 'member')) DEFAULT 'member';
