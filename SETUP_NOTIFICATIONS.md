# Full Notification System Setup

## Step 1: Database Setup

Go to Supabase Dashboard → SQL Editor and run these queries:

### 1. Add sync columns to sessions (if not already done)
```sql
ALTER TABLE sessions 
ADD COLUMN IF NOT EXISTS current_interval INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS time_remaining INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
```

### 2. Create notifications table
```sql
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
```

### 3. Add web push subscription to profiles
```sql
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS web_push_subscription JSONB;

COMMENT ON COLUMN profiles.web_push_subscription IS 'Web Push API subscription for browser notifications';
```

## Step 2: Generate VAPID Keys

Run this in your terminal:
```bash
npm install -g web-push
web-push generate-vapid-keys
```

You'll get output like:
```
Public Key: BEl62iUYg...
Private Key: aBc123...
```

Save these! You'll need them.

## Step 3: Create Supabase Edge Function

Go to Supabase Dashboard → Edge Functions → Create New Function

Name: `send-notification`

Then we'll add the code in the next file.

## Step 4: Set Environment Variables

In Supabase Dashboard → Settings → Edge Functions → Add secret:
- `VAPID_PUBLIC_KEY`: [your public key]
- `VAPID_PRIVATE_KEY`: [your private key]
- `VAPID_SUBJECT`: mailto:your-email@example.com

## Step 5: Deploy and Test

After following all steps, the notification system will be fully functional!
