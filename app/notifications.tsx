// app/notifications.tsx — everything waiting for you in one place.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { listIncomingFriendRequests, respondToFriendRequest, declineFriendRequest, blockUser } from '../lib/api/friends';
import { refreshUnread } from '../lib/notify/counts';
import { ink, round, space } from '../lib/spark/tokens';
import { Button, Card, type, useSparkFonts } from '../components/spark/ui';
import { Badge } from '../components/spark/Badge';

type Req = { id: string; requester: { id: string; username: string | null; avatar_url: string | null } };
type Note = { id: string; type: string; title: string; message: string; data?: any; created_at: string };
type Chat = { id: string; name: string; avatar: string | null; count: number; last: string };

export default function Notifications() {
  useSparkFonts();
  const router = useRouter();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [invites, setInvites] = useState<Note[]>([]);
  const [accepted, setAccepted] = useState<Note[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) { router.replace('/'); return; }
      const [r, notes, dms] = await Promise.all([
        listIncomingFriendRequests().catch(() => []),
        supabase.from('notifications').select('*').eq('user_id', uid).eq('read', false).in('type', ['walk_invite', 'friend_accepted']).order('created_at', { ascending: false }).limit(30),
        supabase.from('direct_messages').select('sender_id, text, created_at').eq('recipient_id', uid).is('read_at', null).order('created_at', { ascending: false }).limit(100),
      ]);
      setReqs(r as any);
      const n = (notes.data || []) as Note[];
      setInvites(n.filter(x => x.type === 'walk_invite'));
      const acc = n.filter(x => x.type === 'friend_accepted');
      setAccepted(acc);

      // Unread friend messages, grouped by who sent them.
      const bySender = new Map<string, { count: number; last: string }>();
      for (const m of dms.data || []) {
        const e = bySender.get(m.sender_id);
        if (e) e.count++; else bySender.set(m.sender_id, { count: 1, last: m.text });
      }
      const ids = [...bySender.keys()];
      const { data: profs } = ids.length ? await supabase.from('profiles').select('id, username, avatar_url').in('id', ids) : { data: [] as any[] };
      setChats(ids.map(id => {
        const p = (profs || []).find((x: any) => x.id === id);
        return { id, name: p?.username || 'A friend', avatar: p?.avatar_url ?? null, count: bySender.get(id)!.count, last: bySender.get(id)!.last };
      }));

      // "Accepted" notices are seen once you've opened this screen.
      if (acc.length) await supabase.from('notifications').update({ read: true }).in('id', acc.map(x => x.id));
      setError(null);
    } catch {
      setError('Couldn’t load your notifications. Check your connection and try again.');
    } finally {
      setReady(true);
      refreshUnread();
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const accept = async (r: Req) => { try { await respondToFriendRequest(r.id, 'accepted'); } catch { setError('Couldn’t accept that. Please try again.'); } load(); };
  const decline = async (r: Req) => { try { await declineFriendRequest(r.id); } catch { setError('Couldn’t remove that. Please try again.'); } load(); };
  const block = async (r: Req) => { try { await blockUser(r.requester.id); } catch { setError('Couldn’t block them just now. Please try again later.'); } load(); };
  const dismiss = async (n: Note) => { await supabase.from('notifications').update({ read: true }).eq('id', n.id); load(); };
  const joinInvite = async (n: Note) => {
    const t = n.data?.token || n.data?.link?.match(/join\/([A-Za-z0-9_-]+)/)?.[1];
    await supabase.from('notifications').update({ read: true }).eq('id', n.id);
    refreshUnread();
    if (t) router.push(`/join/${t}`); else setError('That invitation is from an older version. Ask the host to send a new one.');
  };

  const total = reqs.length + invites.length + accepted.length + chats.length;

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} accessibilityRole="button" accessibilityLabel="Back"
          style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={ink.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.label, { flex: 1, textAlign: 'center' }]}>Notifications</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 60, gap: space.lg, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[type.small, { color: ink.danger }]}>{error}</Text> : null}

        {ready && total === 0 && !error ? (
          <Card style={{ gap: 8, alignItems: 'center', paddingVertical: space.xl }}>
            <Ionicons name="checkmark-circle-outline" size={36} color={ink.moss} />
            <Text style={type.title}>You’re all caught up</Text>
            <Text style={[type.small, { textAlign: 'center' }]}>Friend requests, walk invitations and messages from friends will show up here.</Text>
          </Card>
        ) : null}

        {reqs.length ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={type.title}>Friend requests</Text>
            {reqs.map(r => (
              <Card key={r.id} style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Avatar name={r.requester.username} uri={r.requester.avatar_url} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.label}>{r.requester.username || 'Someone'}</Text>
                    <Text style={type.small}>would like to be your friend</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label="Accept" icon="checkmark" style={{ flex: 1 }} onPress={() => accept(r)} />
                  <Button label="Not now" kind="secondary" style={{ flex: 1 }} onPress={() => decline(r)} />
                </View>
                <Button label="Block this person" icon="ban-outline" kind="quiet" onPress={() => block(r)} a11yHint="They won’t be able to send you requests or messages" />
              </Card>
            ))}
          </View>
        ) : null}

        {invites.length ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={type.title}>Walk invitations</Text>
            {invites.map(n => (
              <Card key={n.id} style={{ gap: 12 }}>
                <Text style={type.label}>{n.message || n.title}</Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button label="Join" icon="walk" style={{ flex: 1 }} onPress={() => joinInvite(n)} />
                  <Button label="Not now" kind="secondary" style={{ flex: 1 }} onPress={() => dismiss(n)} />
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {chats.length ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={type.title}>Messages</Text>
            {chats.map(c => (
              <Card key={c.id} onPress={() => router.push({ pathname: '/chat/[friendId]', params: { friendId: c.id, friendName: c.name } } as any)} label={`${c.count} new from ${c.name}. Open chat.`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
                <Avatar name={c.name} uri={c.avatar} />
                <View style={{ flex: 1 }}>
                  <Text style={type.label}>{c.name}</Text>
                  <Text style={type.small} numberOfLines={1}>{c.last}</Text>
                </View>
                <Badge count={c.count} style={{ borderColor: ink.cardSolid }} />
                <Ionicons name="chevron-forward" size={20} color={ink.sub} />
              </Card>
            ))}
          </View>
        ) : null}

        {accepted.length ? (
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={type.title}>Good news</Text>
            {accepted.map(n => (
              <Card key={n.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Ionicons name="heart" size={22} color={ink.moss} />
                <Text style={[type.label, { flex: 1 }]}>{n.message || n.title}</Text>
              </Card>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 10 }}>
          <Button label="Find friends" icon="people-outline" kind="secondary" onPress={() => router.push('/friends')} />
          <Button label="Profile and account" icon="person-outline" kind="quiet" onPress={() => router.push('/profile')} />
        </View>
      </ScrollView>
    </View>
  );
}

function Avatar({ name, uri }: { name: string | null; uri: string | null }) {
  return (
    <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: ink.cardSolid, alignItems: 'center', justifyContent: 'center' }}>
      {uri ? <Image source={{ uri }} style={{ width: 44, height: 44 }} /> : <Text style={type.label}>{(name || '?')[0].toUpperCase()}</Text>}
    </View>
  );
}
