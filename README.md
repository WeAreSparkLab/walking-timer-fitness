# Spark Walk - Interval Walking Timer 🚶‍♂️

A social interval walking app built with Expo that helps you maintain fitness through synchronized group walks with friends. Walk together even when you're apart!

## Features

### 🏃 Smart Interval Timer
- Configurable walking intervals (warmup, slow pace, fast pace, cooldown)
- Visual progress indicators showing current pace
- Audio beeps for pace transitions (platform-aware)
- Default 21-minute walk (7 intervals × 3 minutes each)
- Save and edit custom walk plans

### 👥 Group Walks
- **Real-time Synchronization**: Start walks together with friends
- **Live Participant Tracking**: See everyone's progress in real-time
- **In-Walk Chat**: Send messages during walks with floating chat button
- **Invite System**: Generate shareable links with unique tokens
- **Deep Linking**: Join walks instantly via `sparkwalk://join/{token}`

### 💬 Social Features
- **Friend Discovery**: Search all users by username or email
- **Friend Requests**: Send and receive friend requests
- **Friend Management**: View your friends list and pending requests
- **Push Notifications**: Get notified about:
  - Friend requests received
  - Friend requests accepted
  - Friends starting group walks
  - New chat messages during walks

### 👤 Profile Management
- Custom avatars (upload to Supabase Storage)
- Username and bio
- Public profile visibility
- Session persistence

### 🔐 Authentication
- Email/password authentication via Supabase Auth
- Secure session management
- Row Level Security (RLS) on all database tables
- Protected routes with authentication gates

### 🌐 Multi-Platform Support
- **Web**: Metro bundler with static export for Vercel deployment
- **iOS**: Native app with haptics and native features
- **Android**: Material Design 3 with edge-to-edge display
- Platform-specific optimizations (haptics, audio, alerts)

## Tech Stack

- **Framework**: Expo SDK 54.0.7
- **Navigation**: expo-router 6.0.4 (file-based routing)
- **Backend**: Supabase
  - PostgreSQL database
  - Real-time subscriptions
  - Authentication
  - Storage (avatars)
- **Audio**: expo-av + Web Audio API
- **Notifications**: expo-notifications
- **Styling**: React Native StyleSheet with custom theme
- **State**: AsyncStorage (local) + Supabase (remote)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Setup Supabase Database

Run the SQL scripts in your Supabase SQL Editor:

```sql
-- 1. Add profile columns
-- Run: sql/add-missing-columns.sql

-- 2. Create group walk tables
-- Run: sql/create-group-walk-tables.sql

-- 3. Add push notification support
-- Run: sql/add-push-token.sql
```

### 4. Configure Expo Project ID

In `app.json`, replace the project ID:

```json
"extra": {
  "eas": {
    "projectId": "your-expo-project-id-here"
  }
}
```

Get your project ID by running:
```bash
npx expo login
npx eas init
```

### 5. Start Development Server

```bash
npx expo start
```

Choose platform:
- Press `w` for web
- Press `i` for iOS simulator
- Press `a` for Android emulator

## Database Schema

### Tables

- **profiles**: User profiles with username, bio, avatar, push token
- **sessions**: Group walk sessions with interval plans
- **session_participants**: Session membership
- **session_progress**: Real-time position tracking
- **session_invites**: Shareable invite tokens
- **session_messages**: In-walk chat messages
- **friendships**: Friend relationships (pending/accepted/blocked)

### Real-time Subscriptions

- Session progress updates (every 2 seconds during walks)
- Chat messages (instant delivery)
- Friend requests (live notifications)

## Project Structure

```
app/
  _layout.tsx          # Root layout with notification handling
  index.tsx            # Login/signup screen
  dashboard.tsx        # Home screen with stats and actions
  walk-timer.tsx       # Main timer with group sync and chat
  create-walk.tsx      # Custom walk plan creator
  profile.tsx          # User profile editor
  friends.tsx          # Friend discovery and management
  start-group-walk.tsx # Session creation screen
  join/
    [token].tsx        # Deep link handler for invites

lib/
  supabaseClient.ts    # Supabase initialization
  storage.ts           # AsyncStorage helpers for local walks
  theme.ts             # Design system (colors, spacing, shadows)
  notifications.ts     # Push notification service
  useMyProfile.ts      # Profile data hook
  api/
    sessions.ts        # Group walk session API
    friends.ts         # Friend request API
    invites.ts         # Invite token API
    messages.ts        # Chat message API
    profile.ts         # Profile management API

sql/
  add-missing-columns.sql       # Profile schema updates
  create-group-walk-tables.sql  # Group walk infrastructure
  add-push-token.sql            # Push notification support
```

## Deployment

### Web (Vercel)

Configuration in `vercel.json`:

```bash
# Build for web
npx expo export -p web

# Deploy to Vercel
vercel deploy
```

### Mobile (EAS Build)

```bash
# iOS
eas build --platform ios

# Android
eas build --platform android
```

## Key Features Implementation

### Group Walk Flow

1. User creates session in `start-group-walk.tsx`
2. Generates invite token via `createInvite()`
3. Shares link with friends
4. Friends join via deep link → `join/[token].tsx` → `redeemInviteToken()`
5. All participants start walk → `walk-timer.tsx` with `sessionId`
6. Real-time progress broadcast via `updateProgress()` every 2 seconds
7. Live chat with `sendMessage()` and `subscribeMessages()`

### Notification System

1. Request permissions on sign-in → `initializePushNotifications()`
2. Save Expo push token to profile
3. Trigger notifications on events:
   - Friend request: `notifyFriendRequest()`
   - Friend accepted: `notifyFriendRequestAccepted()`
   - Group walk invite: `notifyFriendsOfGroupWalk()`
   - Chat message: `notifyNewChatMessage()`
4. Handle taps in `_layout.tsx` → navigate to relevant screen

### Friend Discovery

1. Search users by username/email in `friends.tsx`
2. Send request → `sendFriendRequest()` → triggers notification
3. Recipient sees in "Requests" tab
4. Accept/reject → `respondToFriendRequest()` → triggers notification
5. View friends in "My Friends" tab

## Development Notes

### Platform-Specific Code

Use `Platform.OS` checks for mobile-only features:

```typescript
// Haptics (mobile only)
if (Platform.OS !== 'web') {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

// Alerts (web uses window.confirm)
if (Platform.OS === 'web') {
  if (window.confirm('Are you sure?')) { /* ... */ }
} else {
  Alert.alert('Confirm', 'Are you sure?', [/* ... */]);
}
```

### Real-time Subscriptions

Always clean up subscriptions:

```typescript
useEffect(() => {
  const unsubscribe = subscribeToProgress(sessionId, handleUpdate);
  return () => unsubscribe();
}, [sessionId]);
```

### Supabase RLS Policies

All tables have Row Level Security enabled. User ID must be in:
- INSERT payload for ownership checks
- WHERE clauses for query filters
- JOIN conditions for related data

## Troubleshooting

### Push Notifications Not Working

1. Check project ID in `app.json`
2. Verify `push_token` column exists in profiles table
3. Run `initializePushNotifications()` after sign-in
4. Check Expo push notification status: https://expo.dev/notifications

### Real-time Not Updating

1. Verify Realtime is enabled in Supabase project settings
2. Check table has `REPLICA IDENTITY FULL` for UPDATE events
3. Ensure RLS policies allow SELECT for subscriptions
4. Check browser console for subscription errors

### Deep Links Not Working

1. Verify `scheme` in app.json: `"walking-timer-fitness"`
2. Test with: `npx uri-scheme open walking-timer-fitness://join/abc123 --ios`
3. Check `app/join/[token].tsx` is receiving token parameter

## Contributing

This app was built iteratively with the following progression:

1. ✅ Web configuration and platform compatibility
2. ✅ Authentication system with validation
3. ✅ Supabase database and storage setup
4. ✅ Profile management
5. ✅ Walk timer with audio feedback
6. ✅ Custom walk plans with edit/delete
7. ✅ Group walk infrastructure
8. ✅ Real-time progress synchronization
9. ✅ In-walk chat system
10. ✅ Friend discovery and requests
11. ✅ Push notifications

## License

This project is built with Expo and uses Supabase for backend services.

## Support

For issues or questions:
- Check Expo documentation: https://docs.expo.dev
- Supabase docs: https://supabase.com/docs
- File an issue on GitHub

---

Built with ❤️ using Expo and Supabase
