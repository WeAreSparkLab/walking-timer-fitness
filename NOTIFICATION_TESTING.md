# Walk Invite Notification Testing Guide

## Setup Steps

### 1. Run SQL Migration
In Supabase SQL Editor, run: [sql/create-notifications-table.sql](sql/create-notifications-table.sql)

This creates the `notifications` table and enables realtime.

### 2. Verify Edge Function
Check Supabase Dashboard → Edge Functions → `send-notification` is deployed

### 3. Check Environment Variables
Edge Functions → Secrets should have:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

## Testing Walk Invite Notifications

### Test 1: Send Invite to Friend (Both on Web)

**Browser 1 (User A - Sender):**
1. Log in as User A
2. Dashboard → "Start Group Walk"
3. Enter walk name, select plan
4. Click "Create Session"
5. **Important**: Click a friend in the list (e.g., User B)
6. Should prompt for notification permission (first time only)
7. Should show "Notification sent to [Friend]!"

**Browser 2 (User B - Receiver):**
1. Log in as User B
2. Should receive browser notification: "🚶 Walk Invitation"
3. Click notification → Should open the app (if PWA installed) or the link

### Test 2: Check Browser Console

**In User A's console:**
```
✅ Web push subscription saved
Sending notification to user...
```

**In User B's console:**
```
✅ Successfully subscribed to session control
[Notification received]
```

### Test 3: Check Supabase Tables

**Query 1 - Check notification was created:**
```sql
SELECT * FROM notifications 
WHERE type = 'session_invite' 
ORDER BY created_at DESC 
LIMIT 5;
```

**Query 2 - Check web push subscriptions:**
```sql
SELECT id, username, 
  web_push_subscription IS NOT NULL as has_web_push
FROM profiles 
WHERE web_push_subscription IS NOT NULL;
```

## Expected Behavior

### ✅ Success Indicators:
- Browser prompts for notification permission
- "Notification sent!" confirmation message
- Browser shows notification (even if app is closed)
- Notification appears in `notifications` table
- Clicking notification opens invite link

### ❌ Common Issues:

**"Notification permission denied"**
- User clicked "Block" on permission prompt
- Reset: Browser Settings → Privacy → Site Settings → Notifications → Allow

**"Could not send notification"**
- Edge Function not deployed or environment variables missing
- Check browser console for errors
- Check Supabase Edge Function logs

**No notification appears**
- Web push subscription not saved (check `profiles.web_push_subscription`)
- Service worker not registered (check console for "Service worker ready")
- VAPID keys mismatch (check Edge Function environment variables)

## Debugging Commands

**Check if service worker is active:**
```javascript
navigator.serviceWorker.controller
// Should return a ServiceWorker object
```

**Check notification permission:**
```javascript
Notification.permission
// Should be "granted" after accepting prompt
```

**Test local notification (bypasses Edge Function):**
```javascript
new Notification("Test", { body: "This is a test" });
```

## Next Steps After Testing

If walk invites work:
- Test friend request notifications (similar flow in `lib/api/friends.ts`)
- Test chat message notifications (in group walks)
- Add in-app notification UI (bell icon with badge)
- Add notification history screen
