# Spark Walk - AI Coding Agent Guide

## Project Overview
**Spark Walk** is a cross-platform (iOS, Android, Web) social interval walking app built with Expo/React Native. Users create walking plans, invite friends to group walks, and use in-walk chat. Real-time progress sync is under development.

### Tech Stack
- **Framework**: Expo SDK 54 + expo-router 6 (file-based routing)
- **Backend**: Supabase (PostgreSQL, Realtime, Auth, Storage)
- **UI**: React Native StyleSheet with custom theme system
- **State**: AsyncStorage (local plans) + Supabase (cloud sync)
- **Audio**: expo-av (native) + Web Audio API (web)
- **Notifications**: expo-notifications (native) + Web Push API (web)

## Architecture Patterns

### 1. File-Based Routing (`app/`)
All screens use expo-router file-based convention:
- `app/_layout.tsx` - Root layout with notification handlers, PWA setup, service worker registration
- `app/index.tsx` - Auth screen (login/signup)
- `app/dashboard.tsx` - Home screen with auth gate (redirects if not logged in)
- `app/walk-timer.tsx` - Main timer with real-time sync (1122 lines, complex state management)
- `app/[folder]/[param].tsx` - Dynamic routes (e.g., `join/[token].tsx`, `chat/[friendId].tsx`)

Navigation: `const router = useRouter(); router.push('/path')` or `router.replace('/path')`

### 2. Platform-Specific Code Pattern
**Critical**: Always check `Platform.OS === 'web'` for web-incompatible APIs:

```typescript
// Haptics (mobile-only)
if (Platform.OS !== 'web') {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

// Audio: Web Audio API vs expo-av
if (Platform.OS === 'web') {
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  // ... Web Audio API implementation
} else {
  const { sound } = await Audio.Sound.createAsync(...);
}

// Share: Native Share API vs Clipboard API
if (Platform.OS === 'web') {
  await navigator.clipboard?.writeText?.(link);
  alert('Link copied!');
} else {
  await Share.share({ message: link });
}
```

Files with extensive platform branching: [app/walk-timer.tsx](app/walk-timer.tsx), [lib/actions/invites.ts](lib/actions/invites.ts), [lib/notifications.ts](lib/notifications.ts)

### 3. Supabase API Layer (`lib/api/`)
All Supabase calls are encapsulated in dedicated modules:
- **Authentication pattern**: Every API function starts with `const { data: { user } } = await supabase.auth.getUser();`
- **RLS enforcement**: All tables have Row Level Security policies (see `sql/` folder)
- **Realtime subscriptions**: Use `supabase.channel().on('postgres_changes', ...)` pattern
- **File naming**: `lib/api/{domain}.ts` (e.g., `sessions.ts`, `friends.ts`, `stats.ts`)

Example structure:
```typescript
// lib/api/sessions.ts
export async function createSession(name: string, plan: IntervalDTO[]) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase.from('sessions').insert({...}).select().single();
  if (error) throw error;
  return data;
}
```

### 4. Theme System (`lib/theme.ts`)
Centralized design tokens - **never hardcode colors**:
```typescript
import { colors, pad, radius, paceColors } from '../lib/theme';

// Use: colors.bg, colors.accent, paceColors.FAST.border
// StyleSheet: { backgroundColor: colors.bg, padding: pad.lg, borderRadius: radius.md }
```

Pace-specific colors: `paceColors.WARMUP|FAST|SLOW|COOLDOWN` (each has `fg`, `border`, `bg` properties)

### 5. Real-Time Sync Pattern ([walk-timer.tsx](app/walk-timer.tsx)) ⚠️ IN PROGRESS
Group walks will use Supabase Realtime for synchronization:
- **Infrastructure ready**: `session_progress` and `session_control` tables exist with Realtime replication enabled
- **API functions**: `updateProgress()`, `subscribeToProgress()`, `updateSessionControl()` in [lib/api/sessions.ts](lib/api/sessions.ts)
- **Known issue**: Real-time sync not yet fully functional - needs debugging
- **Cleanup pattern**: Always return unsubscribe functions in `useEffect` to avoid memory leaks

```typescript
// Example pattern (when working):
useEffect(() => {
  const unsub = subscribeToProgress(sessionId, (progress) => { /* update UI */ });
  return () => unsub();
}, [sessionId]);
```

## Development Workflows

### Environment Setup
1. Create `.env` with `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`
2. Run Supabase SQL migrations in order: `sql/add-missing-columns.sql` → `sql/create-group-walk-tables.sql` → `sql/add-push-token.sql`
3. Enable Realtime replication on `session_progress` table (Supabase Dashboard → Database → Replication)
4. Create Storage bucket named `avatars` (public access for profile pictures)

### Common Commands
- `npm start` / `npx expo start` - Start dev server (press `w`/`i`/`a` for platform)
- `npm run web` - Web-only dev server
- `npm run build` - Export static web bundle to `dist/`
- `npx expo install <package>` - Install Expo-compatible package versions

### Database Debugging
- Use `sql/check-group-walks.sql` to inspect session state
- RLS issues? See `sql/fix-rls-policies.sql` or `sql/simple-rls-policies.sql`
- Test queries: Use Supabase SQL Editor with `select auth.uid()` to debug policies

## Key Integration Points

### Authentication Flow
1. [app/index.tsx](app/index.tsx) - Email/password auth with validation (`supabase.auth.signInWithPassword` / `signUp`)
2. [app/dashboard.tsx](app/dashboard.tsx) - Auth gate with `useEffect` check on mount (redirects to `/` if no session)
3. [app/_layout.tsx](app/_layout.tsx) - Handles deep links from notifications (`router.push` based on notification data)

### Deep Linking
- URL scheme: `sparkwalk://join/{token}`
- Implementation: [app/join/\[token\].tsx](app/join/[token].tsx) uses `useLocalSearchParams()` to get token, calls `joinSessionViaToken()`
- Shared via [lib/actions/invites.ts](lib/actions/invites.ts) `createAndShareInvite()`

### Notification System
- **Native**: [lib/notifications.ts](lib/notifications.ts) uses expo-notifications
- **Web**: [lib/webNotifications.ts](lib/webNotifications.ts) uses Web Push API + service worker ([public/firebase-messaging-sw.js](public/firebase-messaging-sw.js))
- **Edge Function**: [supabase/functions/send-notification/index.ts](supabase/functions/send-notification/index.ts) handles push delivery
- **Types**: `friend_request`, `friend_accepted`, `session_invite`, `chat_message` (stored in notification data)

## Common Pitfalls

1. **Web platform checks**: Forgetting `Platform.OS === 'web'` checks causes runtime errors for Haptics, Share, native audio
2. **Auth timing**: Must await `supabase.auth.getUser()` before DB queries (RLS enforcement)
3. **Realtime subscriptions** (when debugging): Always return cleanup functions in `useEffect` to avoid memory leaks
4. **Deep links**: Test with `npx uri-scheme open sparkwalk://join/abc123 --ios` (not testable in web dev mode)
5. **Expo SDK upgrades**: Use `npx expo install --fix` to align all package versions after SDK updates
6. **Group walk sync**: Real-time synchronization is a known work-in-progress - solo walks work fine

## File Locations Reference
- **Screens**: `app/*.tsx` (flat structure, no nested folders except dynamic routes)
- **API layer**: `lib/api/*.ts` (Supabase wrappers)
- **Utilities**: `lib/*.ts` (notifications, storage, theme, hooks)
- **Database migrations**: `sql/*.sql` (run manually in Supabase SQL Editor)
- **Documentation**: `*.md` files (SETUP.md, AUTHENTICATION.md, WEB_DEPLOYMENT.md, etc.)

## Documentation References
- Setup instructions: [SETUP.md](SETUP.md) (complete onboarding guide)
- Auth implementation: [AUTHENTICATION.md](AUTHENTICATION.md) (security patterns)
- Web deployment: [WEB_DEPLOYMENT.md](WEB_DEPLOYMENT.md) (Vercel, Netlify configs)
- Supabase setup: [SUPABASE_SETUP.md](SUPABASE_SETUP.md) (database schema details)
