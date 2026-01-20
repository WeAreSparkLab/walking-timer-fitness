# Deploy Notification Edge Function to Supabase

## Prerequisites
- Supabase account
- Supabase CLI installed: `npm install -g supabase`

## Steps

### 1. Login to Supabase CLI
```bash
supabase login
```

### 2. Link your project
```bash
supabase link --project-ref lzxiipvflwsckygbovnz
```

### 3. Deploy the Edge Function
```bash
supabase functions deploy send-notification
```

### 4. Set Environment Variables

Go to Supabase Dashboard → Settings → Edge Functions → Add secrets:

```
VAPID_PUBLIC_KEY=BKGexLVJAd9Z0oQQuOBXyFL6ygaNrDpcnRi0Ij80CKpgJHZIXsy07Wo5zhyr8h6RKhNU-5yn4MEr1vFpfgCIpAc

VAPID_PRIVATE_KEY=Yt7hS8FFbww3Yo3QzVUOAnbsHBJzGiyq4L2Zcpe1g8Y

VAPID_SUBJECT=mailto:your-email@example.com
```

Replace the email with your actual email.

### 5. Test the Function

```bash
curl -X POST 'https://lzxiipvflwsckygbovnz.supabase.co/functions/v1/send-notification' \
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
https://lzxiipvflwsckygbovnz.supabase.co/functions/v1/send-notification
```

This URL is already configured in the app code!
