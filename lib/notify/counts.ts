// lib/notify/counts.ts — what is waiting for you, counted straight from the database.
//
// Friend requests, unread friend messages and walk invitations are counted from the
// tables themselves, so the badge works without any server function or push service.
// One shared loop checks every ~20 seconds while the app is visible (and whenever you
// come back to it), and alerts you when something new arrives.
import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from '../supabaseClient';
import { loadPrefs } from '../spark/prefs';
import { ping, installAudioUnlock } from '../walk/cues';
import { showNotification, canShowNotifications } from '../webNotifications';

export type Unread = { friendRequests: number; messages: number; updates: number; total: number };
const ZERO: Unread = { friendRequests: 0, messages: 0, updates: 0, total: 0 };

export async function fetchUnread(): Promise<Unread> {
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id;
  if (!uid) return ZERO;
  const head = { count: 'exact' as const, head: true };
  const [fr, dm, nt] = await Promise.all([
    supabase.from('friendships').select('id', head).eq('addressee_id', uid).eq('status', 'pending'),
    supabase.from('direct_messages').select('id', head).eq('recipient_id', uid).is('read_at', null),
    supabase.from('notifications').select('id', head).eq('user_id', uid).eq('read', false).in('type', ['walk_invite', 'friend_accepted']),
  ]);
  const friendRequests = fr.count ?? 0, messages = dm.count ?? 0, updates = nt.count ?? 0;
  return { friendRequests, messages, updates, total: friendRequests + messages + updates };
}

let state: Unread = ZERO;
let loaded = false;
let timer: any = null;
const subs = new Set<(u: Unread) => void>();

const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

async function alertFor(prev: Unread, next: Unread) {
  const prefs = await loadPrefs();
  if (!prefs.alerts) return;
  let title = '', body = '', url = '/notifications';
  if (next.friendRequests > prev.friendRequests) { title = 'New friend request'; body = 'Someone would like to be your friend.'; url = '/notifications'; }
  else if (next.messages > prev.messages) { title = 'New message'; body = 'A friend sent you a message.'; url = '/notifications'; }
  else if (next.updates > prev.updates) { title = 'Something new'; body = 'You have a new invitation or update.'; }
  else return;
  if (isVisible()) ping(prefs.volume);
  else if (canShowNotifications()) showNotification({ type: 'update', title, body, url } as any);
}

export async function refreshUnread() {
  try {
    const next = await fetchUnread();
    const prev = state;
    state = next;
    subs.forEach(s => s(next));
    if (loaded && next.total > prev.total) alertFor(prev, next);
    loaded = true;
  } catch {}
}

function start() {
  if (timer || Platform.OS !== 'web') return;
  installAudioUnlock();
  refreshUnread();
  timer = setInterval(() => { if (isVisible()) refreshUnread(); }, 20000);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (isVisible()) refreshUnread(); });
  AppState.addEventListener('change', s => { if (s === 'active') refreshUnread(); });
}

/** The current counts; re-renders when they change. Mount once near the top of the app to start the loop. */
export function useUnread(): Unread {
  const [u, setU] = useState<Unread>(state);
  useEffect(() => {
    subs.add(setU);
    start();
    setU(state);
    return () => { subs.delete(setU); };
  }, []);
  return u;
}