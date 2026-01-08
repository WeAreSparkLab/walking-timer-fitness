# Setup Guide - Spark Walk

Complete setup instructions to get your Spark Walk app running with all features.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- Expo CLI (`npm install -g expo-cli` or use `npx expo`)
- Supabase account (free tier works)
- Git (for version control)

## Step-by-Step Setup

### 1. Clone and Install

```bash
git clone https://github.com/WeAreSparkLab/walking-timer-fitness.git
cd walking-timer-fitness
npm install
```

### 2. Create Supabase Project

1. Go to https://supabase.com
2. Click "New Project"
3. Name your project (e.g., "spark-walk")
4. Set a strong database password
5. Choose a region close to your users
6. Wait for project to be ready (~2 minutes)

### 3. Get Supabase Credentials

In your Supabase project:

1. Go to **Settings** → **API**
2. Copy the **Project URL** (looks like `https://abc123.supabase.co`)
3. Copy the **anon/public key** (starts with `eyJ...`)

### 4. Configure Environment

Create `.env` file in project root:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

**Important**: Add `.env` to `.gitignore` to keep credentials secret!

### 5. Setup Supabase Database

#### 5.1 Disable Email Confirmation

For development, disable email confirmation:

1. Go to **Authentication** → **Providers** → **Email**
2. Toggle OFF "Confirm email"
3. Click "Save"

#### 5.2 Run SQL Migrations

Go to **SQL Editor** and run each script:

**Script 1**: Add profile columns (`sql/add-missing-columns.sql`)

```sql
-- Add username, bio, and avatar columns to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add unique constraint on username
ALTER TABLE profiles ADD CONSTRAINT profiles_username_key UNIQUE (username);

-- Create index for username searches
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
```

**Script 2**: Create group walk tables (`sql/create-group-walk-tables.sql`)

Copy entire contents of this file (250+ lines) and execute.

**Script 3**: Add push token (`sql/add-push-token.sql`)

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
CREATE INDEX IF NOT EXISTS idx_profiles_push_token ON profiles(push_token) WHERE push_token IS NOT NULL;
```

#### 5.3 Enable Realtime

1. Go to **Database** → **Replication**
2. Find `session_progress` table
3. Toggle ON replication
4. Click "Save"

#### 5.4 Create Storage Bucket

1. Go to **Storage**
2. Click "Create bucket"
3. Name: `avatars`
4. Set to **Public bucket**
5. Click "Create"

### 6. Configure Expo Project

#### 6.1 Login to Expo

```bash
npx expo login
```

Create account if needed at https://expo.dev

#### 6.2 Initialize EAS

```bash
npx eas init
```

This creates a project ID.

#### 6.3 Update app.json

Replace the project ID in `app.json`:

```json
{
  "expo": {
    "extra": {
      "eas": {
        "projectId": "your-actual-project-id-here"
      }
    }
  }
}
```

### 7. Test the App

#### 7.1 Start Development Server

```bash
npx expo start
```

#### 7.2 Test on Web

Press `w` in the terminal to open in browser.

**Test checklist**:
- [ ] Sign up with email/password
- [ ] Sign in with created account
- [ ] Navigate to dashboard
- [ ] View/edit profile
- [ ] Start a solo walk
- [ ] Create custom walk plan
- [ ] Edit/delete walk plan

#### 7.3 Test on Mobile

**iOS Simulator** (Mac only):
```bash
npx expo start --ios
```

**Android Emulator**:
```bash
npx expo start --android
```

**Physical Device**:
1. Install "Expo Go" app from App Store/Play Store
2. Scan QR code from terminal

### 8. Test Group Features

You'll need two devices/browsers:

**Device 1 (Host)**:
1. Sign up as "User A"
2. Go to Friends → Find People
3. Note your username

**Device 2 (Friend)**:
1. Sign up as "User B"
2. Go to Friends → Find People
3. Search for "User A"
4. Send friend request

**Device 1**:
1. Go to Friends → Requests
2. Accept request
3. Click "Start Group Walk"
4. Create session
5. Copy invite link

**Device 2**:
1. Paste invite link in browser
2. Join session
3. Start walk

**Both devices**:
- [ ] See each other's progress update in real-time
- [ ] Open chat modal
- [ ] Send messages back and forth
- [ ] See messages appear instantly

### 9. Setup Push Notifications (Optional)

Push notifications work on physical devices only (not simulators/web).

#### 9.1 Build with EAS

```bash
eas build --platform ios --profile development
# or
eas build --platform android --profile development
```

#### 9.2 Install Built App

Follow EAS instructions to install the development build on your device.

#### 9.3 Test Notifications

1. Sign in on physical device
2. Grant notification permissions when prompted
3. Have friend send friend request
4. Should receive push notification
5. Tap notification → should open to Friends/Requests tab

### 10. Deploy to Production

#### 10.1 Web Deployment (Vercel)

```bash
# Build web version
npx expo export -p web

# Deploy to Vercel
npm install -g vercel
vercel deploy
```

**Configure custom domain** in Vercel dashboard.

#### 10.2 Mobile Deployment

**iOS App Store**:
```bash
eas build --platform ios --profile production
eas submit --platform ios
```

**Google Play Store**:
```bash
eas build --platform android --profile production
eas submit --platform android
```

Follow submission guidelines for each platform.

## Environment Variables Reference

```env
# Required
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx...

# Optional (for analytics/monitoring)
EXPO_PUBLIC_ANALYTICS_ID=your-analytics-id
```

## Verification Checklist

Before going live, verify:

### Database
- [ ] All SQL scripts executed successfully
- [ ] `profiles` table has: username, bio, avatar_url, push_token
- [ ] `sessions`, `session_participants`, `session_progress` tables exist
- [ ] `session_messages`, `friendships`, `session_invites` tables exist
- [ ] RLS policies enabled on all tables
- [ ] Realtime enabled for `session_progress`
- [ ] `avatars` storage bucket is public

### Authentication
- [ ] Email/password sign up works
- [ ] Sign in works
- [ ] Session persistence works (refresh page stays logged in)
- [ ] Protected routes redirect to login when not authenticated
- [ ] Logout works

### Features
- [ ] Profile save (avatar, username, bio)
- [ ] Create custom walk plans
- [ ] Edit/delete walk plans
- [ ] Solo walks work with audio beeps
- [ ] Group walks sync in real-time
- [ ] Chat messages send/receive instantly
- [ ] Friend search finds users
- [ ] Friend requests send/accept/reject
- [ ] Invite links generate and work
- [ ] Deep links open in app

### Platform Support
- [ ] Web version works in Chrome/Firefox/Safari
- [ ] iOS app builds and runs
- [ ] Android app builds and runs
- [ ] Haptics work on mobile (not web)
- [ ] Audio beeps work on all platforms
- [ ] Alert dialogs work on all platforms

### Push Notifications (Mobile Only)
- [ ] Permission request appears on first launch
- [ ] Token saves to database
- [ ] Friend request notification received
- [ ] Friend accepted notification received
- [ ] Group walk invite notification received
- [ ] Tapping notification navigates to correct screen

## Troubleshooting

### "Cannot find module '@supabase/supabase-js'"

```bash
npm install @supabase/supabase-js
```

### "Expo project not found"

Run `npx eas init` to create project.

### "RLS policy violation" errors

Check that:
1. User is authenticated
2. User ID is in INSERT payloads
3. RLS policies allow the operation

### Real-time not updating

1. Enable Realtime in Supabase project settings
2. Enable replication for specific tables
3. Check subscription in browser console
4. Verify RLS allows SELECT for subscription

### Push notifications not working

1. Only works on physical devices
2. Must use development/production build (not Expo Go)
3. Need valid project ID in app.json
4. Check push token saved in database

### Web build fails

```bash
# Clear cache
npx expo start -c

# Reinstall dependencies
rm -rf node_modules
npm install

# Try build again
npx expo export -p web
```

## Next Steps

After setup is complete:

1. **Customize branding**: Update colors in `lib/theme.ts`
2. **Add app icons**: Replace images in `assets/images/`
3. **Configure deep links**: Update scheme in `app.json`
4. **Add analytics**: Integrate Amplitude/Mixpanel
5. **Add error tracking**: Integrate Sentry
6. **Create landing page**: Build marketing site
7. **Setup CI/CD**: Automate builds with GitHub Actions

## Support

- **Expo Docs**: https://docs.expo.dev
- **Supabase Docs**: https://supabase.com/docs
- **GitHub Issues**: File bug reports
- **Discord**: Join Expo/Supabase communities

## Security Checklist

Before production:

- [ ] Change Supabase database password
- [ ] Enable email confirmation in production
- [ ] Add rate limiting to authentication
- [ ] Review RLS policies for security holes
- [ ] Add CORS restrictions in Supabase
- [ ] Setup monitoring and alerts
- [ ] Enable 2FA for Supabase project
- [ ] Review storage bucket permissions
- [ ] Add input validation on all forms
- [ ] Implement request throttling

---

**Setup complete!** 🎉 You're ready to walk with friends.
