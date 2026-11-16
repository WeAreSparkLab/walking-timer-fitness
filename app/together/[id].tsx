// app/together/[id].tsx — Walk Together: lobby → countdown → shared walk → finish.
// Timing comes from server timestamps on the session row, so every walker
// sees the same phase, including after reloads, late joins and lost signal.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, ScrollView, Pressable, Image, Share, Platform, useWindowDimensions, AppState } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabaseClient';
import {
  TogetherSession, Walker, getTogether, getWalkers, getInviteToken, rotateInvite, inviteLink, fetchServerNow,
  startTogether, pauseTogether, resumeTogether, setReady, leaveTogether, cancelTogether, markCompleted, subscribeTogether, getMessagesSince,
} from '../../lib/api/together';
import { sendMessage, subscribeMessages, Message } from '../../lib/api/messages';
import { findPeople, Person } from '../../lib/api/people';
import { listMyFriends, getFriendStatuses, sendFriendRequest, respondToFriendRequest, FriendState } from '../../lib/api/friends';
import { sendNotificationToUser } from '../../lib/api/notifications';
import { recordWalkActivity } from '../../lib/api/stats';
import { syncServerClock, sharedElapsedMs, serverNow } from '../../lib/walk/sharedClock';
import { PHASE_COPY, Segment, phaseAt, segmentsFromIntervals, totalSeconds, fmtClock, fmtMinutes } from '../../lib/walk/schedule';
import { buzz, chime, speak, unlockAudio, createWakeLock, ping } from '../../lib/walk/cues';
import { showNotification, canShowNotifications } from '../../lib/webNotifications';
import { Badge } from '../../components/spark/Badge';
import { backgroundAudioSupported, scheduleCues, cancelScheduled, startKeepAlive, stopKeepAlive, setLockScreen, clearLockScreen } from '../../lib/walk/backgroundAudio';
import { usePrefs } from '../../lib/spark/prefs';
import { getWorld } from '../../lib/spark/worlds';
import { ink, phaseTone, round, space } from '../../lib/spark/tokens';
import { Button, Card, PhaseIcon, Timeline, type, useSparkFonts } from '../../components/spark/ui';
import Scenery3D from '../../components/spark/Scenery3D';
import Scenery from '../../components/spark/Scenery';

const PACE_SPEED = { WARMUP: 0.85, FAST: 1.7, SLOW: 0.75, COOLDOWN: 0.55 } as const;
const bgAudio = backgroundAudioSupported();
const isVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export default function TogetherScreen() {
  useSparkFonts();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const sid = String(id);
  const { width, height } = useWindowDimensions();
  const [prefs] = usePrefs();
  const world = getWorld(prefs.world);

  const [me, setMe] = useState<{ id: string; username: string | null } | null>(null);
  const [session, setSession] = useState<TogetherSession | null>(null);
  const [walkers, setWalkers] = useState<Walker[]>([]);
  const [online, setOnline] = useState<string[]>([]);
  const [conn, setConn] = useState<'connected' | 'connecting' | 'offline'>('connecting');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [now, setNow] = useState(serverNow());
  const [mine, setMine] = useState<{ pausedAt: number | null; total: number }>({ pausedAt: null, total: 0 });
  const [confirm, setConfirm] = useState<null | 'leave' | 'cancel'>(null);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [peopleQuery, setPeopleQuery] = useState('');
  const [peopleResults, setPeopleResults] = useState<Person[]>([]);
  const [peopleNote, setPeopleNote] = useState<string | null>(null);
  const [peopleBusy, setPeopleBusy] = useState(false);
  const [friends, setFriends] = useState<{ id: string; username: string }[]>([]);
  const [invited, setInvited] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [toast, setToast] = useState<{ id: string; name: string; text: string } | null>(null);
  const lastPush = useRef<Record<string, number>>({});
  const alerted = useRef<Set<string>>(new Set()); // messages we have already told you about (history is marked on load)
  const [walkersOpen, setWalkersOpen] = useState(false);
  const [friendStates, setFriendStates] = useState<Record<string, FriendState>>({});
  const [chatText, setChatText] = useState('');
  const [chatSeen, setChatSeen] = useState<string>(() => new Date().toISOString());
  const msgsRef = useRef<Message[]>([]);
  msgsRef.current = messages;

  const isHost = !!(me && session && me.id === session.host_id);
  const segments: Segment[] = useMemo(() => segmentsFromIntervals((session?.plan as any) || []), [session?.plan]);
  const total = totalSeconds(segments);
  const personalMs = mine.total + (mine.pausedAt ? now - mine.pausedAt : 0);
  const elapsedMs = session ? sharedElapsedMs(session, personalMs, now) : null;
  const countdown = elapsedMs != null && elapsedMs < 0 ? Math.ceil(-elapsedMs / 1000) : null;
  const phase = phaseAt(segments, Math.max(0, (elapsedMs ?? 0) / 1000));
  const started = elapsedMs != null;
  const groupPaused = !!session?.paused_at;
  const meStepped = !!mine.pausedAt;
  const running = started && countdown == null && !groupPaused && !meStepped && !phase.done;
  const finished = started && phase.done;

  // ---- load ----
  const reloadWalkers = useCallback(() => getWalkers(sid).then(setWalkers).catch(() => {}), [sid]);

  // New messages are merged by id, so live delivery and the safety-net refresh never double up.
  const addMessages = useCallback((incoming: Message[]) => {
    setMessages(prev => {
      const seen = new Set(prev.map(m => m.id));
      const fresh = incoming.filter(m => !seen.has(m.id));
      return fresh.length ? [...prev, ...fresh].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))) : prev;
    });
  }, []);

  // One refresh does everything: the walk's timeline, who is here, and new chat messages.
  // It runs when live updates arrive, when you come back to the app, and every few seconds
  // as a safety net, so nothing depends on a single live connection staying up.
  const refresh = useCallback(async () => {
    try {
      const s = await getTogether(sid);
      setSession(prev => ({ ...(prev as TogetherSession), ...s }));
      const last = msgsRef.current.length ? msgsRef.current[msgsRef.current.length - 1].created_at : null;
      const [w, m] = await Promise.all([getWalkers(sid), getMessagesSince(sid, last)]);
      setWalkers(w);
      if (m.length) addMessages(m);
      setNow(serverNow());
      setConn('connected');
    } catch (e: any) {
      if (e?.code === 'PGRST116') setError('This walk has ended or was cancelled by the host.');
      else setConn('offline');
    }
  }, [sid, addMessages]);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      const { data: { session: auth } } = await supabase.auth.getSession();
      if (!auth) { router.replace('/'); return; }
      const { data: prof } = await supabase.from('profiles').select('username').eq('id', auth.user.id).maybeSingle();
      const meNow = { id: auth.user.id, username: prof?.username ?? null };
      setMe(meNow);
      syncServerClock(fetchServerNow).then(() => setNow(serverNow())).catch(() => {});
      try {
        const s = await getTogether(sid);
        setSession(s);
        if (s.host_id === meNow.id) getInviteToken(sid).then(t => setToken(t?.token ?? null));
      } catch {
        setError('This walk isn’t available. It may have been cancelled, or you may need a fresh invitation.');
        return;
      }
      reloadWalkers();
      getMessagesSince(sid, null).then(ms => { ms.forEach(m => alerted.current.add(m.id)); addMessages(ms); }).catch(() => {});
      const unsubMsgs = subscribeMessages(sid, m => addMessages([m]));
      const unsubTogether = subscribeTogether(sid, meNow, {
        session: s => setSession(prev => ({ ...(prev as TogetherSession), ...s })),
        walkersChanged: refresh,
        presence: setOnline,
        status: s => setConn(c => (s === 'offline' && c === 'connected' ? c : s)),
      });
      unsub = () => { unsubMsgs(); unsubTogether(); };
    })();
    return () => unsub?.();
  }, [sid]);

  // Catch up after the app was in the background or signal returned.
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => s === 'active' && refresh());
    const onOnline = () => refresh();
    if (typeof window !== 'undefined') window.addEventListener('online', onOnline);
    return () => { sub.remove(); if (typeof window !== 'undefined') window.removeEventListener('online', onOnline); };
  }, [refresh]);

  // Safety net: check in every few seconds while the screen is visible (slower during a walk).
  useEffect(() => {
    if (!me || error) return;
    const t = setInterval(() => { if (isVisible()) refresh(); }, started && !finished ? 5000 : 3000);
    return () => clearInterval(t);
  }, [me, error, started, finished, refresh]);

  // Opening the chat marks everything as read.
  // The chat counts as 'seen' whenever it is on screen: open during the walk, or always in the lobby and at the end.
  const chatVisible = chatOpen || !started || finished;
  useEffect(() => { if (chatVisible) setChatSeen(new Date().toISOString()); }, [chatVisible, messages.length]);

  // Banner clears itself after a few seconds.
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 5000); return () => clearTimeout(h); }, [toast]);

  // Removed by host, or walk deleted.
  useEffect(() => {
    if (me && walkers.length && !walkers.some(w => w.user_id === me.id)) setError('You’re no longer part of this walk.');
  }, [walkers, me]);

  // ---- display tick ----
  useEffect(() => {
    if (!started || finished) return;
    const t = setInterval(() => setNow(serverNow()), 250);
    return () => clearInterval(t);
  }, [started, finished]);

  // ---- wake lock ----
  const wake = useRef<ReturnType<typeof createWakeLock> | null>(null);
  useEffect(() => { if (Platform.OS === 'web') wake.current = createWakeLock(() => {}); return () => wake.current?.disable(); }, []);
  useEffect(() => { if ((running || countdown != null) && prefs.keepAwake) wake.current?.enable(); else wake.current?.disable(); }, [running, countdown != null, prefs.keepAwake]);

  // ---- cues ----
  const lastIdx = useRef<number | null>(null);
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (!started) return;
    const v = prefs.volume;
    if (countdown != null) {
      if (countdown !== lastCount.current && countdown <= 3 && prefs.voice && isVisible()) speak(String(countdown), v);
      lastCount.current = countdown;
      return;
    }
    if (lastIdx.current === phase.index) return;
    const first = lastIdx.current === null;
    lastIdx.current = phase.index;
    const chimeNow = prefs.chime && (first || !bgAudio);
    if (phase.done) {
      if (!first) {
        if (chimeNow) chime('DONE', v);
        if (prefs.vibrate) buzz('DONE');
        if (prefs.voice && isVisible()) speak('You walked together. Lovely work, everyone.', v);
      }
      return;
    }
    if (!running || !phase.segment) return;
    if (chimeNow) chime(phase.segment.pace, v);
    if (prefs.vibrate && !first) buzz(phase.segment.pace);
    if (prefs.voice && isVisible()) speak(`${PHASE_COPY[phase.segment.pace].spoken}`, v);
  }, [phase.index, phase.done, countdown, running, started]);

  // Pre-schedule chimes on the audio clock so they play with the phone locked.
  useEffect(() => {
    if (!bgAudio || elapsedMs == null) return;
    if ((running || countdown != null) && !phase.done) scheduleCues(segments, elapsedMs / 1000, { chime: prefs.chime, volume: prefs.volume, headsUp: prefs.chime });
    else cancelScheduled();
  }, [running, countdown != null, session?.started_at, session?.paused_total_ms, mine.total, prefs.chime, prefs.volume]);

  useEffect(() => {
    if (!running || !phase.segment) return;
    setLockScreen(PHASE_COPY[phase.segment.pace].label, `${session?.name || 'Walk together'} · together`, { play: () => {}, pause: () => {} }, true);
  }, [running, phase.index]);
  useEffect(() => () => { cancelScheduled(); stopKeepAlive(); clearLockScreen(); }, []);

  // ---- finish: record once per device, host marks complete ----
  useEffect(() => {
    if (!finished || !session) return;
    const key = `sparkwalk.together.recorded.${session.id}.${session.started_at}`;
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, '1'); } catch {}
    recordWalkActivity(total, segments.length, session.id).catch(() => {});
    if (isHost) markCompleted(session.id).catch(() => {});
    setTimeout(() => { cancelScheduled(); stopKeepAlive(); clearLockScreen(); }, 2500);
  }, [finished]);

  // ---- actions ----
  const act = async (fn: () => Promise<any>, failMsg: string) => {
    setBusy(true); setNotice(null);
    try { const r = await fn(); if (r && typeof r === 'object' && 'id' in r) setSession(r as TogetherSession); }
    catch { setNotice(failMsg); }
    finally { setBusy(false); }
  };
  const prime = () => { unlockAudio(); startKeepAlive(); };
  const meWalker = walkers.find(w => w.user_id === me?.id);

  const shareLink = async () => {
    if (!token) return;
    const link = inviteLink(token);
    const text = `Walk with me: “${session?.name || 'a walk'}” on Spark Walk`;
    try {
      if (Platform.OS === 'web' && (navigator as any).share) await (navigator as any).share({ title: 'Spark Walk', text, url: link });
      else if (Platform.OS === 'web') { await navigator.clipboard.writeText(link); setNotice('Invitation link copied.'); }
      else await Share.share({ message: `${text} ${link}` });
    } catch {}
  };
  const copyLink = async () => { if (!token) return; try { await navigator.clipboard.writeText(inviteLink(token)); setNotice('Invitation link copied.'); } catch { setNotice(inviteLink(token)); } };
  const newLink = () => act(async () => { setToken(await rotateInvite(sid)); setNotice('New link ready. The old one no longer works.'); }, 'Couldn’t make a new link. Check your connection.');
  const openFriends = async () => { setFriendsOpen(o => !o); if (!friends.length) { try { const f = await listMyFriends(); setFriends((f || []).map((x: any) => ({ id: x.id, username: x.username || 'Friend' }))); } catch {} } };
  const inviteFriend = async (f: { id: string; username: string }) => {
    if (!token) return;
    setInvited(m => ({ ...m, [f.id]: true }));
    const ok = await sendNotificationToUser(f.id, 'Walk invitation', `${me?.username || 'A friend'} invited you to “${session?.name || 'a walk'}”`,
      { type: 'walk_invite', session_id: sid, session_name: session?.name, host_name: me?.username, link: inviteLink(token), token, url: `/join/${token}` });
    if (!ok) setNotice(`Couldn’t notify ${f.username}. You can share the link instead.`);
  };

  // ---- friends: add people you meet on a walk ----
  const walkerKey = walkers.map(w => w.user_id).sort().join(',');
  useEffect(() => {
    if (!me || !walkerKey) return;
    getFriendStatuses(walkerKey.split(',').filter(id => id !== me.id)).then(setFriendStates).catch(() => {});
  }, [walkerKey, me?.id]);
  const addFriend = async (id: string) => {
    setFriendStates(s => ({ ...s, [id]: { status: 'pending_sent' } }));
    try {
      const f = await sendFriendRequest(id);
      setFriendStates(s => ({ ...s, [id]: { status: 'pending_sent', friendshipId: f.id } }));
    } catch {
      setFriendStates(s => ({ ...s, [id]: { status: 'none' } }));
      setNotice('Couldn’t send the friend request. Please try again.');
    }
  };
  const acceptFriend = async (id: string) => {
    const fid = friendStates[id]?.friendshipId;
    if (!fid) return;
    try { await respondToFriendRequest(fid, 'accepted'); setFriendStates(s => ({ ...s, [id]: { status: 'friends', friendshipId: fid } })); }
    catch { setNotice('Couldn’t accept the request. Please try again.'); }
  };
  const searchPeople = async () => {
    setPeopleBusy(true); setPeopleNote(null);
    try {
      const r = await findPeople(peopleQuery);
      const found = r.people.filter(p => p.id !== me?.id);
      setPeopleResults(found);
      setPeopleNote(r.note ?? (found.length ? null : 'No one found. Check the spelling, or try their full email address.'));
      if (found.length) getFriendStatuses(found.map(p => p.id)).then(s => setFriendStates(prev => ({ ...prev, ...s }))).catch(() => {});
    } catch { setPeopleNote('Couldn’t search just now. Check your connection and try again.'); }
    finally { setPeopleBusy(false); }
  };
  const friendFor = (w: Walker) => (me && w.user_id !== me.id
    ? <FriendButton name={w.username || 'this walker'} state={friendStates[w.user_id]?.status ?? 'none'} onAdd={() => addFriend(w.user_id)} onAccept={() => acceptFriend(w.user_id)} />
    : null);

  // ---- chat ----
  const nameOf = (m: Message) => m.sender?.username || walkers.find(w => w.user_id === m.sender_id)?.username || 'Walker';
  const unread = messages.filter(m => m.sender_id !== me?.id && String(m.created_at) > chatSeen).length;
  // New message from someone else: a soft ping, a short buzz and a banner (if the chat isn't already on
  // screen); or a browser notification if the app is in the background. Switch off in Settings → Alerts.
  useEffect(() => {
    if (!me) return;
    const fresh = messages.filter(m => m.sender_id !== me.id && !alerted.current.has(m.id));
    if (!fresh.length) return;
    fresh.forEach(m => alerted.current.add(m.id));
    if (!prefs.alerts) return;
    const m = fresh[fresh.length - 1];
    const who = nameOf(m);
    if (isVisible()) {
      if (chatVisible) return;
      ping(prefs.volume);
      if (prefs.vibrate) { try { (navigator as any).vibrate?.(60); } catch {} }
      setToast({ id: m.id, name: who, text: m.text });
    } else if (canShowNotifications()) {
      showNotification({ type: 'group_message', title: `${who} (group walk)`, body: m.text.length > 80 ? m.text.slice(0, 80) + '…' : m.text, url: `/together/${sid}` } as any);
    }
  }, [messages.length]);

  const toastEl = toast ? (
    <Pressable onPress={() => { setChatOpen(true); setToast(null); }} accessibilityRole="button" accessibilityLiveRegion="polite"
      accessibilityLabel={`New message from ${toast.name}: ${toast.text}. Tap to open the chat.`}
      style={{ position: 'absolute', top: 56, left: 16, right: 16, zIndex: 20, maxWidth: 560, alignSelf: 'center', flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: round.md, backgroundColor: ink.cardSolid, borderWidth: 1.5, borderColor: ink.ember }}>
      <Ionicons name="chatbubble-ellipses" size={22} color={ink.ember} />
      <View style={{ flex: 1 }}>
        <Text style={[type.small, { color: ink.moss, fontWeight: '700' }]}>{toast.name}</Text>
        <Text style={[type.body, { color: ink.text }]} numberOfLines={2}>{toast.text}</Text>
      </View>
    </Pressable>
  ) : null;

  const send = async () => {
    const text = chatText.trim();
    if (!text) return;
    setChatText('');
    try {
      addMessages([await sendMessage(sid, text)]);
      // Nudge walkers who aren't looking at the walk right now, at most once a minute each.
      const t = Date.now();
      walkers.filter(w => w.user_id !== me?.id && !online.includes(w.user_id)).forEach(w => {
        if (t - (lastPush.current[w.user_id] ?? 0) < 60000) return;
        lastPush.current[w.user_id] = t;
        sendNotificationToUser(w.user_id, `${me?.username || 'Someone'} (group walk)`, text.length > 80 ? text.slice(0, 80) + '…' : text,
          { type: 'group_message', session_id: sid, url: `/together/${sid}` });
      });
    } catch { setChatText(text); setNotice('Couldn’t send your message. Check your connection.'); }
  };
  const chat = <ChatPanel messages={messages} meId={me?.id ?? ''} nameOf={nameOf} text={chatText} setText={setChatText} onSend={send} />;

  // ---- render ----
  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: ink.bg, padding: space.lg, justifyContent: 'center', gap: 16, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        <Text style={type.title}>{error}</Text>
        <Button label="Back to home" onPress={() => router.replace('/dashboard')} />
      </View>
    );
  }
  if (!session || !me) return <View style={{ flex: 1, backgroundColor: ink.bg }} />;

  const hostName = walkers.find(w => w.user_id === session.host_id)?.username || 'The host';
  const hostOnline = online.includes(session.host_id);
  const togetherCount = walkers.filter(w => online.includes(w.user_id)).length;
  const showScene = !prefs.lowPower && world.layers.length > 0;
  const expired = session.status === 'completed' && !finished;

  const header = (
    <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center' }}>
      <Pressable onPress={() => router.replace('/dashboard')} accessibilityRole="button" accessibilityLabel={started && !finished ? 'Back to home. The walk carries on.' : 'Back to home'}
        style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
        <Ionicons name="chevron-back" size={28} color={ink.text} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[type.label, { flex: 1, textAlign: 'center' }]}>{session.name || 'Walk together'}</Text>
      <ConnDot conn={conn} />
    </View>
  );

  // FINISH
  if (finished || expired) {
    return (
      <View style={{ flex: 1, backgroundColor: ink.bg }}>
        <View style={{ height: 280 }}>{!prefs.lowPower ? <Scenery3D world={world} fadeTo={ink.bg} enabled={prefs.scene3d} speed={0.4} /> : null}</View>
        <ScrollView contentContainerStyle={{ padding: space.lg, marginTop: -40, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
          <Text accessibilityRole="header" style={type.display}>You walked together.</Text>
          <Text style={type.body}>{fmtMinutes(total)} of “{session.name || 'your walk'}”, side by side from wherever you were.</Text>
          <Card style={{ gap: 12 }}>
            <Text style={type.eyebrow}>Walking together</Text>
            {walkers.map(w => <WalkerRow key={w.user_id} w={w} host={w.user_id === session.host_id} you={w.user_id === me.id} friend={friendFor(w)} />)}
          </Card>
          <Card style={{ gap: 10 }}>
            <Text style={type.label}>Say thanks</Text>
            {chat}
          </Card>
          <Button label="Back to home" onPress={() => router.replace('/dashboard')} />
        </ScrollView>
      </View>
    );
  }

  // LOBBY
  if (!started) {
    const readyCount = walkers.filter(w => w.ready).length;
    return (
      <View style={{ flex: 1, backgroundColor: ink.bg }}>
        {toastEl}
        {header}
        <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 60, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
          {showScene ? <View style={{ height: 150, borderRadius: round.lg, overflow: 'hidden' }}><Scenery world={world} still /></View> : null}
          <View style={{ gap: 6 }}>
            <Text style={type.eyebrow}>Walk together</Text>
            <Text style={type.title}>{session.name || 'Walk together'}</Text>
            <Text style={type.body}>{fmtMinutes(total)} · {segments.length} parts · hosted by {isHost ? 'you' : hostName}</Text>
            <View style={{ marginTop: 6 }}><Timeline segments={segments} height={26} /></View>
          </View>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={type.label}>Walkers</Text>
              <Text style={type.small}>{readyCount} of {walkers.length} ready</Text>
            </View>
            {walkers.map(w => <WalkerRow key={w.user_id} w={w} host={w.user_id === session.host_id} you={w.user_id === me.id} online={online.includes(w.user_id)} lobby friend={friendFor(w)} />)}
          </Card>

          <Card style={{ gap: 10 }}>
            <Text style={type.label}>Chat</Text>
            {chat}
          </Card>

          {!isHost ? (
            <Button big label={meWalker?.ready ? 'Ready — tap to undo' : 'I’m ready'} icon={meWalker?.ready ? 'checkmark-circle' : 'hand-left-outline'}
              kind={meWalker?.ready ? 'secondary' : 'primary'} a11yHint="Also allows sound cues on this phone"
              onPress={() => { prime(); setReady(sid, !meWalker?.ready).then(reloadWalkers); }} />
          ) : null}
          {!isHost ? (
            <Text style={[type.small, { textAlign: 'center' }]}>
              {hostOnline ? `${hostName} will start the walk for everyone. Keep this screen open.` : `Waiting for ${hostName} to come online.`}
            </Text>
          ) : null}

          {isHost ? (
            <>
              <Button big label="Start for everyone" icon="play" disabled={busy}
                a11yHint="Starts a 10 second countdown on every walker’s phone"
                onPress={() => { prime(); act(() => startTogether(sid, 10), 'Couldn’t start. Check your connection and try again.'); }} />
              <Text style={[type.small, { textAlign: 'center' }]}>Everyone gets a 10-second countdown, then the same walk at the same moment.</Text>
              <Card style={{ gap: 10 }}>
                <Text style={type.label}>Invite people</Text>
                <Text style={type.small}>This private link works for 7 days. Only people with the link can join.</Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Button label="Share link" icon="share-outline" style={{ flexGrow: 1 }} onPress={shareLink} disabled={!token} />
                  <Button label="Copy" icon="copy-outline" kind="secondary" onPress={copyLink} disabled={!token} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                  <Button label="Find and invite people" icon="people-outline" kind="secondary" style={{ flexGrow: 1 }} onPress={openFriends} />
                  <Button label="New link" icon="refresh" kind="quiet" onPress={newLink} />
                </View>
                {friendsOpen ? (
                  <View style={{ gap: 10 }}>
                    <Text style={type.small}>Find anyone on Spark Walk by username, or by their full email address. Friends can be invited straight away. To invite someone new, send them a friend request first, or share the link above.</Text>
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <TextInput value={peopleQuery} onChangeText={setPeopleQuery} onSubmitEditing={searchPeople} autoCapitalize="none" autoCorrect={false}
                        accessibilityLabel="Find a person by username or full email address" placeholder="Username or full email" placeholderTextColor={ink.faint}
                        style={{ flex: 1, minHeight: 48, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 12, fontSize: 16, backgroundColor: 'rgba(0,0,0,0.2)' }} />
                      <Button label="Search" icon="search" kind="secondary" disabled={peopleBusy} onPress={searchPeople} style={{ minHeight: 48, paddingHorizontal: 14 }} />
                    </View>
                    {peopleNote ? <Text accessibilityLiveRegion="polite" style={type.small}>{peopleNote}</Text> : null}
                    {peopleResults.map(p => {
                      const st = friendStates[p.id]?.status ?? 'none';
                      const name = p.username || 'New walker';
                      return (
                        <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 10 }}>
                          <Text style={[type.label, { flex: 1 }]}>{name}</Text>
                          {st === 'friends'
                            ? <Button label={invited[p.id] ? 'Invited' : 'Invite'} kind={invited[p.id] ? 'quiet' : 'secondary'} disabled={invited[p.id]} onPress={() => inviteFriend({ id: p.id, username: name })} style={{ minHeight: 44 }} />
                            : st === 'pending_sent' ? <Text style={type.small}>Friend request sent</Text>
                            : st === 'pending_received' ? <Button label="Accept request" kind="secondary" onPress={() => acceptFriend(p.id)} style={{ minHeight: 44 }} />
                            : <Button label="Add friend" kind="secondary" onPress={() => addFriend(p.id)} style={{ minHeight: 44 }} />}
                        </View>
                      );
                    })}
                    {friends.length ? <Text style={[type.eyebrow, { marginTop: 4 }]}>Your friends</Text> : null}
                    {friends.map(f => (
                      <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 10 }}>
                        <Text style={[type.label, { flex: 1 }]}>{f.username}</Text>
                        <Button label={invited[f.id] ? 'Invited' : 'Invite'} kind={invited[f.id] ? 'quiet' : 'secondary'} disabled={invited[f.id]} onPress={() => inviteFriend(f)} style={{ minHeight: 44 }} />
                      </View>
                    ))}
                    {!friends.length ? <Text style={type.small}>No friends yet. Search above to find someone, or share the link.</Text> : null}
                  </View>
                ) : null}
              </Card>
            </>
          ) : null}

          {notice ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.ember }]}>{notice}</Text> : null}
          <LeaveOrCancel isHost={isHost} confirm={confirm} setConfirm={setConfirm}
            onLeave={() => leaveTogether(sid).then(() => router.replace('/dashboard'))}
            onCancel={() => cancelTogether(sid).then(() => router.replace('/dashboard')).catch(() => setNotice('Couldn’t cancel. Try again.'))} />
        </ScrollView>
      </View>
    );
  }

  // COUNTDOWN + WALK
  const seg = phase.segment ?? segments[0];
  const tone = phaseTone[seg.pace];
  const digits = Math.min(140, Math.max(84, width * 0.27));
  const status = countdown != null ? `Starting in ${countdown}` : groupPaused ? `Paused by ${isHost ? 'you' : hostName}` : meStepped ? 'Paused just for you' : 'Now';

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      {toastEl}
      {header}
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.md, paddingBottom: 40, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
        {showScene ? (
          <View style={{ height: Math.round(Math.min(260, Math.max(160, height * 0.27))), borderRadius: round.lg, overflow: 'hidden', marginTop: 8 }}>
            {prefs.walkScene ? <Scenery3D world={world} enabled={prefs.scene3d} economy speed={running ? PACE_SPEED[seg.pace] : 0} /> : <Scenery world={world} still />}
          </View>
        ) : null}

        {/* Together indicator: who is here, nothing about where */}
        <Pressable onPress={() => setWalkersOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: walkersOpen }}
          accessibilityLabel={`${togetherCount} of ${walkers.length} walkers connected. Tap to see who is here and add friends.`}
          style={{ marginTop: 12, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row' }}>
            {walkers.slice(0, 5).map((w, i) => <Avatar key={w.user_id} w={w} size={28} dim={!online.includes(w.user_id)} style={{ marginLeft: i ? -8 : 0 }} />)}
          </View>
          <Text style={[type.small, { flex: 1 }]}>{togetherCount} walking together</Text>
          <Ionicons name={walkersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={ink.sub} />
        </Pressable>
        {walkersOpen ? (
          <Card style={{ gap: 6, marginTop: 4 }}>
            <Text style={type.small}>Tap “Add friend” to stay in touch after the walk.</Text>
            {walkers.map(w => <WalkerRow key={w.user_id} w={w} host={w.user_id === session.host_id} you={w.user_id === me.id} online={online.includes(w.user_id)} friend={friendFor(w)} />)}
          </Card>
        ) : null}
        {!hostOnline && !isHost ? <Text style={[type.small, { marginTop: 6 }]}>{hostName}’s connection dropped. The walk carries on for everyone.</Text> : null}
        {conn === 'offline' ? <Text style={[type.small, { marginTop: 6, color: ink.ember }]}>You’re offline. Your timer keeps going and catches up when you reconnect.</Text> : null}

        <View accessible accessibilityLiveRegion="polite" style={{ marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tone.dark, alignItems: 'center', justifyContent: 'center' }}>
            <PhaseIcon pace={seg.pace} size={28} color={tone.onDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={type.eyebrow}>{status}</Text>
            <Text style={[type.title, { fontSize: 30, lineHeight: 36 }]}>{countdown != null ? 'Get ready' : PHASE_COPY[seg.pace].label}</Text>
          </View>
        </View>

        <Text accessibilityElementsHidden importantForAccessibility="no"
          style={[type.num, { color: ink.text, fontSize: digits, lineHeight: digits * 1.05, letterSpacing: -2, marginTop: 10, textAlign: 'center' }]}>
          {countdown != null ? String(countdown) : fmtClock(phase.remainingInSegment)}
        </Text>
        <Text style={[type.small, { textAlign: 'center', fontSize: 16 }]}>
          Part {Math.min(phase.index + 1, segments.length)} of {segments.length} · {fmtClock(countdown != null ? total : phase.remainingTotal)} left
        </Text>
        <View style={{ marginTop: 22 }}><Timeline segments={segments} progress={phase.elapsed / (total || 1)} /></View>

        {phase.next ? (
          <View style={{ marginTop: 18, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: round.md, backgroundColor: ink.card, borderWidth: 1, borderColor: ink.line }}>
            <Text style={type.eyebrow}>Next</Text>
            <PhaseIcon pace={phase.next.pace} />
            <Text style={[type.label, { flex: 1 }]}>{PHASE_COPY[phase.next.pace].label}</Text>
            <Text style={[type.num, { color: ink.sub, fontSize: 16 }]}>{fmtClock(phase.next.seconds)}</Text>
          </View>
        ) : null}

        <View style={{ marginTop: 22, gap: 12 }}>
          {isHost && countdown == null ? (
            groupPaused
              ? <Button big label="Resume for everyone" icon="play" disabled={busy} onPress={() => { prime(); act(() => resumeTogether(sid), 'Couldn’t resume. Check your connection.'); }} />
              : <Button big label="Pause for everyone" icon="pause" disabled={busy} onPress={() => act(() => pauseTogether(sid), 'Couldn’t pause. Check your connection.')} />
          ) : null}
          {countdown == null && !groupPaused ? (
            meStepped
              ? <Button label="Catch up with the group" icon="play-forward" onPress={() => { prime(); setMine({ pausedAt: null, total: 0 }); }} a11yHint="Jumps back to where everyone else is" />
              : <Button label="Pause just me" icon="pause-outline" kind="secondary" onPress={() => setMine(m => ({ ...m, pausedAt: serverNow() }))} a11yHint="Others keep walking. You can catch up any time." />
          ) : null}
          {meStepped && !groupPaused ? <Text style={[type.small, { textAlign: 'center' }]}>Others are still walking. Catching up takes you to where they are now.</Text> : null}
          <View>
            <Button label="Chat" icon="chatbubbles-outline" kind="secondary" onPress={() => setChatOpen(o => !o)} a11yHint="Messages stay quiet while you walk" />
            <Badge count={unread} style={{ position: 'absolute', top: -8, right: -6 }} label={` new message${unread === 1 ? '' : 's'}`} />
          </View>
          {chatOpen ? <Card style={{ gap: 10 }}>{chat}</Card> : null}
          {notice ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.ember }]}>{notice}</Text> : null}
          <LeaveOrCancel isHost={isHost} confirm={confirm} setConfirm={setConfirm} walking
            onLeave={() => leaveTogether(sid).then(() => router.replace('/dashboard'))}
            onCancel={() => markCompleted(sid).then(() => getTogether(sid).then(setSession)).catch(() => setNotice('Couldn’t end the walk. Try again.'))} />
        </View>
        <Text style={[type.small, { marginTop: 20, textAlign: 'center' }]}>
          Everyone follows the same timeline. No locations are shared. You can lock your phone; chimes keep playing.
        </Text>
      </ScrollView>
    </View>
  );
}

function ConnDot({ conn }: { conn: 'connected' | 'connecting' | 'offline' }) {
  const label = conn === 'connected' ? 'Connected' : conn === 'connecting' ? 'Connecting' : 'Offline';
  const color = conn === 'connected' ? ink.moss : conn === 'connecting' ? ink.ember : ink.danger;
  return (
    <View accessible accessibilityLabel={label} style={{ minWidth: 48, alignItems: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={conn === 'offline' ? 'cloud-offline-outline' : 'wifi'} size={16} color={color} />
        <Text style={[type.small, { fontSize: 12 }]}>{label}</Text>
      </View>
    </View>
  );
}

function Avatar({ w, size, dim, style }: { w: Walker; size: number; dim?: boolean; style?: any }) {
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: ink.cardSolid, borderWidth: 2, borderColor: ink.bg, alignItems: 'center', justifyContent: 'center', opacity: dim ? 0.4 : 1 }, style]}>
      {w.avatar_url ? <Image source={{ uri: w.avatar_url }} style={{ width: size, height: size }} /> : <Text style={[type.label, { fontSize: size * 0.42 }]}>{(w.username || '?')[0].toUpperCase()}</Text>}
    </View>
  );
}

/** Add friend / Request sent / Accept / Friends, for one walker. */
function FriendButton({ name, state, onAdd, onAccept }: { name: string; state: FriendState['status']; onAdd: () => void; onAccept: () => void }) {
  if (state === 'friends') return <View accessible accessibilityLabel={`You and ${name} are friends`} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="heart" size={14} color={ink.moss} /><Text style={type.small}>Friends</Text></View>;
  if (state === 'pending_sent') return <Text accessibilityLabel={`Friend request sent to ${name}`} style={type.small}>Friend request sent</Text>;
  const accept = state === 'pending_received';
  return (
    <Pressable onPress={accept ? onAccept : onAdd} accessibilityRole="button" accessibilityLabel={accept ? `Accept ${name}’s friend request` : `Add ${name} as a friend`}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={[type.small, { color: ink.ember, fontWeight: '700', textDecorationLine: 'underline' }]}>{accept ? 'Accept friend request' : 'Add friend'}</Text>
    </Pressable>
  );
}

function WalkerRow({ w, host, you, online, lobby, friend }: { w: Walker; host: boolean; you: boolean; online?: boolean; lobby?: boolean; friend?: React.ReactNode }) {
  const name = `${w.username || 'Walker'}${you ? ' (you)' : ''}`;
  const state = lobby ? `${w.ready || host ? 'ready' : 'not ready yet'}${online === false ? ', not connected' : ''}` : '';
  return (
    <View accessible accessibilityLabel={`${name}${host ? ', host' : ''}${state ? ', ' + state : ''}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}>
      <Avatar w={w} size={36} dim={online === false} />
      <View style={{ flex: 1 }}>
        <Text style={type.label}>{name}</Text>
        {host ? <Text style={type.small}>Host</Text> : null}
        {friend}
      </View>
      {lobby ? (
        w.ready || host
          ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="checkmark-circle" size={18} color={ink.moss} /><Text style={type.small}>Ready</Text></View>
          : <Text style={type.small}>Not ready</Text>
      ) : null}
    </View>
  );
}

function LeaveOrCancel({ isHost, confirm, setConfirm, onLeave, onCancel, walking }: {
  isHost: boolean; confirm: null | 'leave' | 'cancel'; setConfirm: (c: null | 'leave' | 'cancel') => void; onLeave: () => void; onCancel: () => void; walking?: boolean;
}) {
  const kind = isHost ? 'cancel' : 'leave';
  if (confirm === kind) {
    return (
      <Card style={{ gap: 10, borderColor: 'rgba(255,138,122,0.5)' }}>
        <Text style={type.label}>{isHost ? (walking ? 'End this walk for everyone?' : 'Cancel this walk for everyone?') : 'Leave this walk? You’ll need a new invitation to rejoin.'}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button label="Keep going" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirm(null)} />
          <Button label={isHost ? (walking ? 'End walk' : 'Cancel walk') : 'Leave'} kind="danger" style={{ flex: 1 }} onPress={isHost ? onCancel : onLeave} />
        </View>
      </Card>
    );
  }
  return <Button label={isHost ? (walking ? 'End walk for everyone' : 'Cancel walk') : 'Leave walk'} kind="quiet" icon="exit-outline" onPress={() => setConfirm(kind)} />;
}

function ChatPanel({ messages, meId, nameOf, text, setText, onSend }: {
  messages: Message[]; meId: string; nameOf: (m: Message) => string; text: string; setText: (t: string) => void; onSend: () => void;
}) {
  const shown = messages.slice(-30);
  return (
    <View style={{ gap: 10 }}>
      <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }} nestedScrollEnabled>
        {shown.length === 0 ? <Text style={type.small}>No messages yet. Say hello to your walking group.</Text> : shown.map(m => {
          const mine = m.sender_id === meId;
          return (
            <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', padding: 10, borderRadius: round.md, backgroundColor: mine ? 'rgba(242,166,90,0.16)' : 'rgba(246,241,231,0.08)' }}>
              {!mine ? <Text style={[type.small, { color: ink.moss, fontWeight: '600' }]}>{nameOf(m)}</Text> : null}
              <Text style={[type.body, { color: ink.text }]}>{m.text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput value={text} onChangeText={setText} onSubmitEditing={onSend} placeholder="Write a message" placeholderTextColor={ink.faint} maxLength={500}
          accessibilityLabel="Message to the group"
          style={{ flex: 1, minHeight: 48, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 12, fontSize: 16, backgroundColor: 'rgba(0,0,0,0.2)' }} />
        <Button label="Send" icon="send" onPress={onSend} disabled={!text.trim()} style={{ minHeight: 48, paddingHorizontal: 14 }} />
      </View>
    </View>
  );
}