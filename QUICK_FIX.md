# Quick Fixes for Your Supabase Setup

## Current Status:
- ✅ Database: Working (profiles table exists)
- ❌ Authentication: Not working
- ❌ Storage: avatars bucket missing

---

## Fix 1: Enable Email Authentication

1. Go to: https://supabase.com/dashboard/project/aysyggpgusqxhiuankti/auth/providers
2. Find **Email** in the list
3. Click the toggle or edit button to enable it
4. **IMPORTANT**: Under "Email" settings:
   - Find **"Confirm email"** 
   - Set it to **OFF** (disabled) for now
   - This allows instant signup without email verification
5. Click **Save**

## Fix 2: Create Avatars Storage Bucket

1. Go to: https://supabase.com/dashboard/project/aysyggpgusqxhiuankti/storage/buckets
2. Click **"New bucket"** button (top right)
3. Fill in:
   ```
   Name: avatars
   Public bucket: ✅ YES (check this box)
   File size limit: 5 MB
   Allowed MIME types: image/*
   ```
4. Click **Create bucket**
5. Click on the `avatars` bucket you just created
6. Go to **Policies** tab
7. Click **New policy**
8. Select **"For full customization"** 
9. Fill in:
   ```
   Policy name: Allow authenticated uploads
   
   SELECT ✅ (check this)
   INSERT ✅ (check this)
   UPDATE ✅ (check this)
   DELETE ✅ (check this)
   
   Target roles: authenticated
   ```
10. Click **Review** then **Save policy**

---

## Test Again

After making both changes:

1. Refresh the test page in your browser
2. Click **"Run All Tests"** again
3. All three should show ✅

---

## Then Test Your App

1. Run: `npm run web`
2. Try signing up with:
   - Email: `yourname@example.com`
   - Password: `test123456`
3. Should work! ✅

---

## Why Authentication Failed

Common reasons:
- Email provider not enabled
- Email confirmation required but no SMTP configured
- Rate limiting (too many failed attempts)

The fix above (disabling "Confirm email") should solve it.

---

## Quick Links

- [Authentication Providers](https://supabase.com/dashboard/project/aysyggpgusqxhiuankti/auth/providers)
- [Storage Buckets](https://supabase.com/dashboard/project/aysyggpgusqxhiuankti/storage/buckets)
- [Your Supabase Dashboard](https://supabase.com/dashboard/project/aysyggpgusqxhiuankti)
