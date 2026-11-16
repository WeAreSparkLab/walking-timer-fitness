// supabase/functions/send-notification/index.ts
// Sends a notification to ONE person: an in-app row (for badge types) plus a web push.
//
// Safety:
//  - Deployed with JWT verification, and the caller must be a signed-in USER (the public anon key is rejected).
//  - You can only notify: someone you asked to be friends with (friend_request), your accepted
//    friends (friend_accepted, walk_invite, direct_message), or someone in the same group walk (group_message).
//  - Nothing about the recipient's profile is logged.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const TYPES = ['friend_request', 'friend_accepted', 'walk_invite', 'direct_message', 'group_message'];
const IN_APP = ['walk_invite', 'friend_accepted']; // the others are counted straight from their own tables
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function allowed(admin: any, me: string, to: string, type: string, data: any): Promise<boolean> {
  if (type === 'friend_request') {
    const { data: r } = await admin.from('friendships').select('id').eq('requester_id', me).eq('addressee_id', to).eq('status', 'pending').limit(1);
    return !!r?.length;
  }
  if (type === 'group_message') {
    const sid = data?.session_id;
    if (typeof sid !== 'string' || !UUID.test(sid)) return false;
    const { data: r } = await admin.from('session_participants').select('user_id').eq('session_id', sid).in('user_id', [me, to]);
    return (r?.length ?? 0) === 2;
  }
  // friend_accepted, walk_invite, direct_message: accepted friends only
  const { data: r } = await admin.from('friendships').select('id').eq('status', 'accepted')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${to}),and(requester_id.eq.${to},addressee_id.eq.${me})`).limit(1);
  return !!r?.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: u, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !u?.user) return json({ error: 'Not signed in' }, 401);
    const me = u.user.id;

    const { userId, title, body, data } = await req.json();
    const type = data?.type;
    if (typeof userId !== 'string' || !UUID.test(userId) || userId === me) return json({ error: 'Bad request' }, 400);
    if (!TYPES.includes(type)) return json({ error: 'Unknown notification type' }, 400);
    const t = String(title ?? '').slice(0, 120), b = String(body ?? '').slice(0, 300);
    if (!t) return json({ error: 'Bad request' }, 400);

    if (!(await allowed(admin, me, userId, type, data))) return json({ error: 'Not allowed' }, 403);

    // In-app row (only for the kinds the badge counts from this table).
    let inApp = false;
    if (IN_APP.includes(type)) {
      const { error } = await admin.from('notifications').insert({ user_id: userId, type, title: t, message: b, data });
      inApp = !error;
    }

    const { data: profile } = await admin.from('profiles').select('web_push_subscription, push_token').eq('id', userId).maybeSingle();

    // Web push (browser / installed app).
    let webPush = false;
    const sub = profile?.web_push_subscription;
    const pub = Deno.env.get('VAPID_PUBLIC_KEY'), priv = Deno.env.get('VAPID_PRIVATE_KEY');
    if (sub?.endpoint && pub && priv) {
      try {
        webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:support@wearesparklab.com', pub, priv);
        const url = typeof data?.url === 'string' && data.url.startsWith('/') ? data.url : '/notifications';
        await webpush.sendNotification(sub, JSON.stringify({ title: t, body: b, icon: '/icon-192.png', badge: '/icon-192.png', data: { type, url, session_id: data?.session_id } }), { TTL: 3600 });
        webPush = true;
      } catch (e: any) {
        // 404/410 means the browser has dropped this subscription: forget it so we stop trying.
        if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from('profiles').update({ web_push_subscription: null }).eq('id', userId);
        console.error('web push failed', e?.statusCode ?? '', String(e?.message ?? '').slice(0, 120));
      }
    }

    // Mobile app push (Expo), if that person has the native app.
    if (profile?.push_token) {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: profile.push_token, title: t, body: b, data, sound: 'default' }) });
      } catch { /* ignore */ }
    }

    return json({ success: true, inApp, webPush });
  } catch (e: any) {
    console.error('send-notification error', String(e?.message ?? e).slice(0, 160));
    return json({ error: 'Something went wrong' }, 500);
  }
});