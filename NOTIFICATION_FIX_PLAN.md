# Notification System Fix

## Problems Identified

### 1. **Notifications are calling wrong functions**
- Friend requests call `notifyFriendRequest()` but should use `sendNotificationToUser()` (Edge Function)
- Direct push notification sending bypasses the Edge Function entirely
- Missing web notification support in friend/invite flows

### 2. **Web notifications not properly initialized**
- `_layout.tsx` tries to subscribe immediately but should wait for user interaction
- No permission prompt on first launch
- Web push subscription happens before permission granted

### 3. **Edge Function not deployed** (likely)
- Based on docs, need to verify if deployed
- Need to check environment variables are set

### 4. **Notifications table may not exist**
- Edge Function tries to insert into `notifications` table
- Need SQL migration to create it

## Quick Test: Is the Edge Function Working?

**What's working on web?**
- Native (iOS/Android): ✅ Should work if edge function deployed
- Web push: ❌ Not called in friend/invite flows

**What's NOT working?**
- Friend request notifications (using direct Expo push instead of Edge Function)
- Walk invite notifications (same issue)
- Web users won't receive any notifications

Let me know:
1. **Have you deployed the Edge Function?** (see DEPLOY_EDGE_FUNCTION.md)
2. **What type of notification isn't working?** (Friend requests? Walk invites? Chat messages?)
3. **Are you testing on web or mobile?**
