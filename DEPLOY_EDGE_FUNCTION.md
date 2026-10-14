# Deploy Notification Edge Function to Supabase

## Method 1: Via Supabase Dashboard (EASIEST - Recommended)

### 1. Open Supabase Dashboard
Go to https://supabase.com/dashboard/project/YOUR_PROJECT_REF

### 2. Navigate to Edge Functions
- Click "Edge Functions" in the left sidebar
- Click "Create a new function"

### 3. Create the Function
- **Function name**: `send-notification`
- Copy and paste the entire code from `supabase/functions/send-notification/index.ts`
- Click "Deploy"

### 4. Set Environment Variables

Go to Supabase Dashboard → Settings → Edge Functions → Add secrets:

```
VAPID_PUBLIC_KEY=YOUR_VAPID_PUBLIC_KEY

VAPID_PRIVATE_KEY=YOUR_VAPID_PRIVATE_KEY

VAPID_SUBJECT=mailto:your-email@example.com
```

Replace the email with your actual email.

### 5. Done! ✅

The function is now deployed and ready to use. The app will automatically use it when sharing walks to friends.

---

## Method 2: Via Supabase CLI (Alternative)

### Prerequisites
- Supabase CLI installed via Scoop (Windows):
  ```powershell
  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
  scoop install supabase
  ```


### 3. Deploy the Edge Function
```bash
supabase functions deploy send-notification
```

---

## Test the Function

```bash
curl -X POST 'YOUR_PROJECT_URL/functions/v1/send-notification' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "user-id-here",
    "title": "Test Notification",
    "body": "This is a test notification",
    "data": {"type": "test"}
  }'
```

## Alternative: Deploy via Supabase Dashboard

1. Go to Supabase Dashboard → Edge Functions
2. Click "Create New Function"
3. Name it: `send-notification`
4. Copy the code from `supabase/functions/send-notification/index.ts`
5. Deploy
6. Add the environment variables in Settings → Edge Functions → Secrets

## Verify Deployment

After deployment, you should see the function listed in your Supabase Dashboard under Edge Functions. The URL will be:

```
YOUR_PROJECT_URL/functions/v1/send-notification
```

This URL is already configured in the app code!
