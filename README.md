# Spark Walk

**A social interval-walking app: build a walking plan, then walk it in sync with friends, with live progress and chat.**

**Live demo:** [walks.wearesparklab.com](https://walks.wearesparklab.com/)

Built with Expo (React Native + TypeScript) and Supabase. One codebase runs on web (deployed to Vercel), iOS and Android.

## Features

- **Interval timer:** warm-up, slow and fast pace, and cool-down phases with audio cues and visual progress. The default is a 21-minute walk (7 x 3 minutes), and you can save custom plans.
- **Group walks:** start a session, share an invite link and walk together. Participants see each other's progress in real time.
- **In-walk chat and direct messages** between friends.
- **Friends:** search users, send and accept requests, view profiles and a leaderboard.
- **Push notifications:** friend requests, group walk invites and new messages (web push and native).
- **Accounts:** email/password auth, profiles with avatar upload, and Row Level Security on every table.

## Tech stack

| Area | Tools |
|---|---|
| App | Expo SDK 54, React Native 0.81, React 19, TypeScript, expo-router (file-based routing) |
| Backend | Supabase: Postgres, Auth, Realtime, Storage, Edge Functions |
| Notifications | expo-notifications, Firebase Cloud Messaging, Web Push (Supabase Edge Function `send-notification`) |
| Hosting | Vercel (web export), EAS Build (native) |
| CI | GitHub Actions workflow that keeps the free-tier Supabase project from pausing |

## Run it locally

```bash
git clone https://github.com/WeAreSparkLab/walking-timer-fitness.git
cd walking-timer-fitness
npm install
cp .env.example .env     # add your Supabase URL and anon key
npx expo start           # press w for web, i for iOS, a for Android
```

1. Create a free Supabase project.
2. In **Project Settings -> API**, copy the project URL and the **anon/public** key into `.env`. Never use the `service_role` key in the app.
3. In the SQL Editor, run `supabase/migrations/20261014_consolidated_schema.sql`. It creates the tables, RLS policies, the avatars bucket, realtime and the leaderboard trigger. The other files in `sql/` are history only.

## How it works

- `app/` holds the screens (dashboard, timer, create walk, friends, chat, leaderboard, profile, join-by-invite).
- `lib/api/` holds the data layer: sessions, friends, invites, messages, notifications and stats.
- **Group sync:** the host's session is a row in Postgres, and each participant writes progress to it. Everyone else subscribes via Supabase Realtime.
- **Invites:** a unique token creates a shareable link that deep-links into the app (`walking-timer-fitness://join/<token>`) or the web app.
- **Security:** the client only ever holds the anon key. Access control lives in RLS policies, not in the client.

## Deploy

```bash
npm run build      # static web export to dist/
vercel deploy
```

Native builds use `eas build --platform ios|android`.

## What I'd improve next

- Add automated tests for the session-sync logic and the RLS policies.
- Consolidate the setup guides in the repo root into a single `docs/` folder.
- Replace the 2-second progress writes with Realtime broadcast to cut database load.
- Publish the native apps to the app stores.
