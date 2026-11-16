// app/dashboard.tsx — Spark Walk home (Phase 1 redesign).
// (The previous dashboard was retired; /classic-dashboard redirects here.)
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Image, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { getPlans, removePlan, WalkPlan } from '../lib/storage';
import { getRecentActivities, getPeriodStats, Activity } from '../lib/api/stats';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSession, leaveSession } from '../lib/api/sessions';
import { PENDING_JOIN_KEY, getTogether, createTogetherWalk } from '../lib/api/together';
import { useMyProfile } from '../lib/useMyProfile';
import { ensureMyProfile } from '../lib/api/profile';
import { useUnread } from '../lib/notify/counts';
import { useGuest, loadGuest } from '../lib/guest';
import { Badge } from '../components/spark/Badge';
import { loadActiveWalk, ActiveWalk, elapsedMs } from '../lib/walk/engine';
import { PRESETS, buildSegments, segmentsFromIntervals, totalSeconds, fmtMinutes, fmtClock } from '../lib/walk/schedule';
import { usePrefs, prefersReducedMotion } from '../lib/spark/prefs';
import { WORLDS, SIMPLE_WORLD, getWorld } from '../lib/spark/worlds';
import { ink, round, space } from '../lib/spark/tokens';
import { Button, Card, Collapsible, Timeline, Toggle, type, useSparkFonts } from '../components/spark/ui';
import Scenery from '../components/spark/Scenery';
import Scenery3D from '../components/spark/Scenery3D';
import HomeSettings from '../components/spark/HomeSettings';
import InstallNudge from '../components/spark/InstallNudge';
import { WalkRow, GroupRow } from '../components/spark/WalkRows';

type GroupWalk = { id: string; name: string | null; status: string; host_id: string; created_at: string; count: number };
type Invite = { id: string; data: { session_id?: string; session_name?: string; host_name?: string; link?: string; token?: string } };

const ENCOURAGEMENT = [
  'A few minutes outside is always worth it.',
  'Go at whatever pace feels right today.',
  'Short walks count. Slow walks count.',
  'Fresh air, your way.',
  'No rush. Just you and the next step.',
];

export default function Dashboard() {
  useSparkFonts();
  const router = useRouter();
  const { username, avatarUrl } = useMyProfile();
  const unread = useUnread();
  const [prefs, setPrefs] = usePrefs();
  const [authChecked, setAuthChecked] = useState(false);
  const [plans, setPlans] = useState<WalkPlan[]>([]);
  const [active, setActive] = useState<ActiveWalk | null>(null);
  const [recent, setRecent] = useState<Activity[] | null>(null);
  const [weekSeconds, setWeekSeconds] = useState(0);
  const [groups, setGroups] = useState<GroupWalk[]>([]);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const guest = useGuest();
  const [guestPrompt, setGuestPrompt] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        // Not signed in: guests can look around; everyone else goes to the sign-in page.
        if (await loadGuest()) setAuthChecked(true); else router.replace('/');
        return;
      }
      setUserId(session.user.id); setAuthChecked(true); ensureMyProfile().catch(() => {});
      // Opened an invitation before signing in? Continue to it now.
      AsyncStorage.getItem(PENDING_JOIN_KEY).then(t => { if (t) router.push(`/join/${t}`); }).catch(() => {});
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_e, session) => {
      if (!session && !(await loadGuest())) router.replace('/');
    });
    return () => subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
    setPlans(await getPlans());
    setActive(await loadActiveWalk());
    getRecentActivities(4).then(setRecent).catch(() => setRecent([]));
    getPeriodStats('week').then(s => setWeekSeconds(s.duration_seconds)).catch(() => {});
    loadGroups().then(setGroups).catch(() => {});
    loadInvites().then(setInvites).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { if (authChecked) load(); }, [authChecked, load]));

  if (!authChecked) {
    return <View style={{ flex: 1, backgroundColor: ink.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={ink.ember} /></View>;
  }

  const world = getWorld(prefs.world);
  const sortedPlans = [...plans].sort((a, b) => Number(!!b.favourite) - Number(!!a.favourite));
  const favourite = sortedPlans[0];
  const firstTime = plans.length === 0 && recent !== null && recent.length === 0;
  const primary = favourite
    ? { label: favourite.name, seconds: totalSeconds(segmentsFromIntervals(favourite.intervals)), go: () => router.push({ pathname: '/walk', params: { planId: favourite.id } }) }
    : { label: PRESETS[0].name, seconds: totalSeconds(buildSegments(PRESETS[0].structure)), go: () => router.push({ pathname: '/walk', params: { preset: PRESETS[0].id } }) };
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const line = ENCOURAGEMENT[new Date().getDate() % ENCOURAGEMENT.length];
  const still = prefs.lowPower || prefersReducedMotion();

  const submitJoin = () => {
    const raw = joinCode.trim();
    const m = raw.match(/join\/([A-Za-z0-9_-]+)/);
    const token = m ? m[1] : raw.replace(/[^A-Za-z0-9_-]/g, '');
    if (token.length < 6) return setJoinError('That doesn’t look like an invitation. Paste the whole link your friend sent.');
    setJoinError(null);
    router.push(`/join/${token}`);
  };

  // Invitations carry the secure link; joining goes through /join/<token>.
  const acceptInvite = async (inv: Invite) => {
    const t = inv.data.token || inv.data.link?.match(/join\/([A-Za-z0-9_-]+)/)?.[1];
    await supabase.from('notifications').update({ read: true }).eq('id', inv.id);
    setInvites(v => v.filter(i => i.id !== inv.id));
    if (t) router.push(`/join/${t}`);
    else { setJoinOpen(true); setJoinError('That invitation is from an older version. Ask the host to send a new one.'); }
  };
  const dismissInvite = async (inv: Invite) => {
    setInvites(v => v.filter(i => i.id !== inv.id));
    await supabase.from('notifications').update({ read: true }).eq('id', inv.id);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: ink.bg }} contentContainerStyle={{ paddingBottom: 64 }}>
      {/* Hero world */}
      <View style={{ height: 420, justifyContent: 'flex-end' }}>
        {!prefs.lowPower ? <Scenery3D world={world} still={still} fadeTo={ink.bg} enabled={prefs.scene3d} /> : null}
        <View style={{ position: 'absolute', top: 44, left: space.md, right: space.md, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(13,19,16,0.45)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: round.pill }}>
            <Ionicons name="sparkles" size={16} color={ink.ember} />
            <Text style={[type.label, { fontSize: 15 }]}>Spark Walk</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={() => router.push('/settings')} accessibilityRole="button" accessibilityLabel="Settings and walking worlds"
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(13,19,16,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(246,241,231,0.4)' }}>
              <Ionicons name="settings-outline" size={20} color={ink.text} />
            </Pressable>
            {guest ? (
              <Pressable onPress={() => router.push('/')} accessibilityRole="button" accessibilityLabel="Sign in or create an account"
                style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: ink.ember, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[type.label, { color: ink.emberInk, fontSize: 15 }]}>Sign in</Text>
              </Pressable>
            ) : (
          <View style={{ width: 48, height: 48 }}>
            <Pressable onPress={() => router.push(unread.total > 0 ? '/notifications' : '/profile')} accessibilityRole="button"
              accessibilityLabel={unread.total > 0 ? `Your profile. ${unread.total} new notification${unread.total === 1 ? '' : 's'}. Tap to see them.` : 'Your profile'}
              style={{ width: 48, height: 48, borderRadius: 24, overflow: 'hidden', backgroundColor: 'rgba(13,19,16,0.5)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(246,241,231,0.5)' }}>
              {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44 }} /> : <Ionicons name="person" size={22} color={ink.text} />}
            </Pressable>
            <Badge count={unread.total} style={{ position: 'absolute', top: -6, right: -6 }} />
          </View>
            )}
          </View>
        </View>
        <View style={wrap({ paddingHorizontal: space.md, paddingBottom: 8 })}>
          <Text style={[type.small, { color: ink.text, opacity: 0.85 }]}>{hello}{username ? `, ${username}` : ''}</Text>
          <Text accessibilityRole="header" style={[type.display, { fontSize: 38, lineHeight: 44, marginTop: 4 }]}>Ready for a little fresh air?</Text>
          <Text style={[type.body, { marginTop: 8, color: ink.text, opacity: 0.8 }]}>{line}</Text>
        </View>
      </View>

      <View style={wrap({ paddingHorizontal: space.md, gap: space.lg })}>
        {/* Resume */}
        {active ? (
          <Card style={{ borderColor: 'rgba(242,166,90,0.55)', backgroundColor: 'rgba(242,166,90,0.1)', gap: 12 }}>
            <Text style={type.eyebrow}>Walk in progress</Text>
            <Text style={type.title}>{active.name}</Text>
            <Text style={type.small}>
              {active.clock.pausedAt ? 'Paused' : 'Still timing'} · {fmtClock(totalSeconds(active.segments) - elapsedMs(active.clock) / 1000)} left
            </Text>
            <Button label="Return to walk" icon="play" onPress={() => router.push({ pathname: '/walk', params: { resume: '1' } })} />
          </Card>
        ) : null}

        {/* Primary action */}
        <View style={{ gap: 10 }}>
          <Button big label="Start a walk" icon="walk" onPress={primary.go} a11yHint={`Opens ${primary.label}, ${fmtMinutes(primary.seconds)}`} />
          <Text style={[type.small, { textAlign: 'center' }]}>{primary.label} · {fmtMinutes(primary.seconds)}</Text>
        </View>

        {/* Together */}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Card style={{ flex: 1, gap: 8, minHeight: 128 }} onPress={() => (guest ? setGuestPrompt(true) : router.push('/together/new'))} label="Walk together: create a group walk and invite friends">
            <Ionicons name="people-outline" size={26} color={ink.moss} />
            <Text style={type.label}>Walk together</Text>
            <Text style={type.small}>Create a group walk and invite friends</Text>
          </Card>
          <Card style={{ flex: 1, gap: 8, minHeight: 128 }} onPress={() => (guest ? setGuestPrompt(true) : setJoinOpen(o => !o))} label="Join a friend’s walk with an invitation link">
            <Ionicons name="link-outline" size={26} color={ink.moss} />
            <Text style={type.label}>Join a walk</Text>
            <Text style={type.small}>Paste a friend’s invitation</Text>
          </Card>
        </View>
        {guest && guestPrompt ? (
          <Card style={{ gap: 10, borderColor: 'rgba(242,166,90,0.55)', backgroundColor: 'rgba(242,166,90,0.08)' }}>
            <Text style={type.title}>Walking together needs an account</Text>
            <Text style={type.small}>It’s free. With an account you can invite friends, join their walks and keep your walking history. You can still use everything else as a guest.</Text>
            <Button label="Sign in or create an account" icon="log-in-outline" onPress={() => router.push('/')} />
          </Card>
        ) : null}
        {joinOpen ? (
          <Card style={{ gap: 10 }}>
            <Text nativeID="joinLabel" style={type.label}>Invitation link or code</Text>
            <TextInput value={joinCode} onChangeText={setJoinCode} onSubmitEditing={submitJoin} autoCapitalize="none" autoCorrect={false}
              accessibilityLabelledBy="joinLabel" placeholder="https://walks.wearesparklab.com/join/…" placeholderTextColor={ink.faint}
              style={{ minHeight: 54, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 14, fontSize: 16, backgroundColor: 'rgba(0,0,0,0.2)' }} />
            {joinError ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.danger }]}>{joinError}</Text> : null}
            <Button label="Join walk" onPress={submitJoin} />
          </Card>
        ) : null}

        {/* What's new */}
        {unread.total > 0 ? (
          <Card onPress={() => router.push('/notifications')} label={`${unread.total} new. See what's new.`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderColor: 'rgba(255,92,77,0.55)', backgroundColor: 'rgba(255,92,77,0.08)' }}>
            <Badge count={unread.total} style={{ borderColor: ink.cardSolid }} />
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{unread.total === 1 ? 'You have 1 new notification' : `You have ${unread.total} new notifications`}</Text>
              <Text style={type.small}>
                {[unread.friendRequests ? `${unread.friendRequests} friend request${unread.friendRequests === 1 ? '' : 's'}` : '', unread.messages ? `${unread.messages} message${unread.messages === 1 ? '' : 's'}` : '', unread.updates ? `${unread.updates} update${unread.updates === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={ink.sub} />
          </Card>
        ) : null}

        {guest ? (
          <Button label="Sign in or create an account" icon="log-in-outline" kind="secondary" onPress={() => router.push('/')} a11yHint="Needed to walk with friends and keep your history" />
        ) : (
          <>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="Friends" icon="heart-outline" kind="secondary" style={{ paddingHorizontal: 10 }} onPress={() => router.push('/friends')} />
            <Badge count={unread.friendRequests + unread.messages} style={{ position: 'absolute', top: -6, right: -4 }} label={`${unread.friendRequests + unread.messages} new in friends`} />
          </View>
          <Button label="Profile" icon="person-outline" kind="secondary" style={{ flex: 1, paddingHorizontal: 10 }} onPress={() => router.push('/profile')} />
        </View>
          </>
        )}

        <InstallNudge onHowTo={() => router.push('/settings')} />

        {/* Invitations */}
        {invites.map(inv => (
          <Card key={inv.id} style={{ gap: 10 }}>
            <Text style={type.eyebrow}>Invitation</Text>
            <Text style={type.label}>{inv.data.host_name || 'A friend'} invited you to “{inv.data.session_name || 'a group walk'}”</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button label="Join" style={{ flex: 1 }} onPress={() => acceptInvite(inv)} />
              <Button label="Not now" kind="secondary" style={{ flex: 1 }} onPress={() => dismissInvite(inv)} />
            </View>
          </Card>
        ))}

        {/* First time */}
        {firstTime ? (
          <Collapsible title="Welcome to Spark Walk" storageKey="sparkwalk.home.welcome">
          <Card style={{ gap: 14 }}>
            {[
              ['options-outline', 'Pick a walk', 'Try a ready-made walk or build your own mix of brisk and easy.'],
              ['volume-medium-outline', 'Walk with cues', 'Gentle chimes and an optional voice tell you when to change pace.'],
              ['people-outline', 'Walk together', 'Invite friends to follow the same walk, wherever they are.'],
            ].map(([icon, t, d]) => (
              <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
                <Ionicons name={icon as any} size={22} color={ink.ember} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}><Text style={type.label}>{t}</Text><Text style={type.small}>{d}</Text></View>
              </View>
            ))}
          </Card>
          </Collapsible>
        ) : null}

        {/* Group walks */}
        {groups.length ? (
          <Collapsible title={`Your group walks (${groups.length})`} storageKey="sparkwalk.home.groupWalks"
            action={<Button label="New" icon="add" kind="quiet" onPress={() => router.push('/together/new')} style={{ minHeight: 48, paddingHorizontal: 8 }} />}>
            {groups.slice(0, 8).map(g => (
              <GroupRow key={g.id} name={g.name || 'Group walk'} isHost={g.host_id === userId}
                sub={`${g.status === 'completed' ? 'Finished' : g.host_id === userId ? 'You’re hosting' : 'Joined'} · ${g.count} ${g.count === 1 ? 'walker' : 'walkers'}`}
                onAgain={g.status === 'completed' ? async () => {
                  try {
                    const s = await getTogether(g.id);
                    const r = await createTogetherWalk(s.name || 'Group walk', s.plan);
                    router.push(`/together/${r.session.id}`);
                  } catch { setGroupError('Couldn’t set up a new walk. Check your connection and try again.'); }
                } : undefined}
                onOpen={() => router.push(`/together/${g.id}`)}
                onRemove={async () => {
                  try {
                    if (g.host_id === userId) await deleteSession(g.id); else await leaveSession(g.id);
                    setGroupError(null);
                    setGroups(prev => prev.filter(x => x.id !== g.id));
                  } catch { setGroupError('Couldn’t do that just now. Check your connection and try again.'); }
                }} />
            ))}
            {groupError ? <Text accessibilityLiveRegion="polite" style={[type.small, { color: ink.danger }]}>{groupError}</Text> : null}
          </Collapsible>
        ) : null}

        {/* Walks */}
        <Section title="Choose a walk (just for you)" action={{ label: 'Create', icon: 'add', onPress: () => router.push('/create-walk') }}>
          {sortedPlans.map(p => {
            const segs = segmentsFromIntervals(p.intervals);
            return <WalkRow key={p.id} name={p.name} sub={`${p.favourite ? '★ Favourite' : 'Your plan'} · ${fmtMinutes(totalSeconds(segs))}`} segs={segs}
              onPress={() => router.push({ pathname: '/walk', params: { planId: p.id } })}
              onEdit={() => router.push({ pathname: '/create-walk', params: { editId: p.id } })}
              onDelete={async () => { await removePlan(p.id); setPlans(await getPlans()); }} />;
          })}
          {PRESETS.map(p => {
            const segs = buildSegments(p.structure);
            return <WalkRow key={p.id} name={p.name} sub={`${p.blurb} · ${fmtMinutes(totalSeconds(segs))}`} segs={segs}
              onPress={() => router.push({ pathname: '/walk', params: { preset: p.id } })} />;
          })}
          <Text style={[type.small, { color: ink.faint }]}>These are for walking on your own. To walk with friends, tap Walk together to create a group walk. Ready-made walks are examples, not medical advice, so go at a pace that feels comfortable.</Text>
        </Section>

        {/* Recent */}
        {recent && recent.length ? (
          <Section title="Recently">
            <Text style={type.body}>{weekSeconds > 0 ? `${fmtMinutes(weekSeconds)} of walking this week.` : 'A fresh week — no pressure.'}</Text>
            {recent.map(a => (
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
                <Ionicons name={a.activity_type === 'group_walk' ? 'people-outline' : 'walk-outline'} size={20} color={ink.sub} />
                <Text style={[type.label, { flex: 1, fontWeight: '500' }]}>{a.activity_type === 'group_walk' ? 'Walk together' : 'Walk'} · {fmtMinutes(a.duration_seconds)}</Text>
                <Text style={type.small}>{new Date(a.completed_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Text style={[type.small, { color: ink.faint, textAlign: 'center' }]}>Your pace. Your path. Better together.</Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, action, children }: { title: string; action?: { label: string; icon: any; onPress: () => void }; children: React.ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" style={type.title}>{title}</Text>
        {action ? <Button label={action.label} icon={action.icon} kind="quiet" onPress={action.onPress} style={{ minHeight: 48, paddingHorizontal: 8 }} /> : null}
      </View>
      {children}
    </View>
  );
}

const wrap = (s: any) => ({ maxWidth: 600, width: '100%' as const, alignSelf: 'center' as const, ...s });

async function loadGroups(): Promise<GroupWalk[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: mine } = await supabase.from('session_participants').select('session_id').eq('user_id', user.id);
  const ids = (mine || []).map(r => r.session_id);
  if (!ids.length) return [];
  const { data: sessions } = await supabase.from('sessions').select('id, name, status, host_id, created_at')
    .in('id', ids).or(`status.neq.completed,updated_at.gt.${new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString()}`).order('created_at', { ascending: false }).limit(8);
  const { data: parts } = await supabase.from('session_participants').select('session_id').in('session_id', (sessions || []).map(s => s.id));
  return (sessions || []).map(s => ({ ...s, count: (parts || []).filter(p => p.session_id === s.id).length }));
}

async function loadInvites(): Promise<Invite[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from('notifications').select('id, data').eq('user_id', user.id).eq('read', false).order('created_at', { ascending: false });
  return (data || []).filter((n: any) => n.data?.type === 'walk_invite');
}
