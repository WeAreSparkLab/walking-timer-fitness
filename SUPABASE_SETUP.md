# Supabase Setup Guide

## 🔧 Why Can't I Sign Up or Sign In?

Your user authentication is connecting to **Supabase**, but the database needs to be properly configured.

## Current Status

✅ **Supabase Client Configured**
- URL: `https://aysyggpgusqxhiuankti.supabase.co`
- Anon Key: Present in `.env` file

❓ **Database Setup** - Needs verification

---

## Quick Fix - 3 Steps

### 1️⃣ Enable Email Authentication

1. Go to your [Supabase Dashboard](https://supabase.com/dashboard/project/aysyggpgusqxhiuankti)
2. Click **Authentication** → **Providers**
3. Find **Email** provider and click **Edit**
4. Make sure:
   - ✅ **Enable Email provider** is ON
   - ⚠️  **Confirm email** - Disable this for testing (or configure SMTP)
5. Click **Save**

### 2️⃣ Create Profiles Table

1. Go to **SQL Editor** in your Supabase dashboard
2. Click **New Query**
3. Copy and paste this SQL:

```sql
-- Create profiles table
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  username TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Policy: Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);
```

4. Click **Run** (or press Ctrl+Enter)
5. You should see "Success. No rows returned"

### 3️⃣ Create Storage Bucket

1. Go to **Storage** in your Supabase dashboard
2. Click **New bucket**
3. Configure:
   - **Name**: `avatars`
   - **Public bucket**: ✅ Yes
   - **File size limit**: 5 MB
   - **Allowed MIME types**: image/*
4. Click **Create bucket**
5. Click on the `avatars` bucket
6. Go to **Policies** tab
7. Create a policy:
   - **Policy name**: "Allow authenticated uploads"
   - **Allowed operations**: INSERT, UPDATE
   - **Target roles**: authenticated
   - Click **Create policy**

---

## 🧪 Test Your Setup

I've created a test page for you: **Open `test-supabase.html` in your browser**

This will:
- ✅ Test sign up functionality
- ✅ Verify database connection
- ✅ Check storage bucket
- 📋 Show detailed error messages

---

## Common Issues

### "Email not confirmed"
- **Solution**: Disable email confirmation in Authentication settings
- OR configure SMTP (Authentication → Settings → SMTP Settings)

### "Signup disabled"
- **Solution**: Enable Email provider in Authentication → Providers

### "Table 'profiles' does not exist"
- **Solution**: Run the SQL from Step 2 above

### "Storage bucket not found"
- **Solution**: Create the avatars bucket from Step 3 above

---

## Where User Data is Stored

Your app uses **Supabase** as the backend:

| Data Type | Storage Location |
|-----------|------------------|
| **User accounts** | `auth.users` table (managed by Supabase Auth) |
| **User profiles** | `public.profiles` table (username, bio, avatar_url) |
| **Walk plans** | Local device storage (AsyncStorage) |
| **Avatar images** | Supabase Storage (`avatars` bucket) |
| **Sessions** | Supabase Auth (automatic) |

## Authentication Flow

```
User enters email/password
        ↓
Supabase Auth validates credentials
        ↓
Creates user in auth.users table
        ↓
App creates profile in profiles table
        ↓
Returns session token
        ↓
User is logged in ✅
```

---

## Need Help?

1. **Run the test**: Open `test-supabase.html` in your browser
2. **Check the dashboard**: [https://supabase.com/dashboard/project/aysyggpgusqxhiuankti](https://supabase.com/dashboard/project/aysyggpgusqxhiuankti)
3. **Review error messages** in the browser console (F12)

---

## Quick Test (After Setup)

1. Start your app: `npm run web`
2. Try to sign up with:
   - Email: `test@example.com`
   - Password: `test123456`
3. Should see success message ✅
4. Should redirect to dashboard ✅

If it works, you're all set! 🎉
