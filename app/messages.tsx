// app/messages.tsx — chat with your friends any time, not just during a walk.
import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Image } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { listMyFriends } from '../lib/api/friends';
import { ink, space } from '../lib/spark/tokens';
import { Button, Card, type, useSparkFonts } from '../components/spark/ui';
import { Badge } from '../components/spark/Badge';

type Row = { id: string; name: string; avatar: string | null; last: string | null; at: string | null; unread: number };

export default function Messages() {
  useSparkFonts();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id;
      if (!uid) { router.replace('/'); return; }
      const [friends, dms] = await Promise.all([
        listMyFriends(),
        supabase.from('direct_messages').select('sender_id, recipient_id, text, created_at, read_at')
          .or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).order('created_at', { ascending: false }).limit(300),
      ]);
      const info = new Map<string, { last: string; at: string; unread: number }>();
      for (const m of dms.data || []) {
        const other = m.sender_id === uid ? m.recipient_id : m.sender_id;
        const e = info.get(other) || { last: m.text, at: m.created_at, unread: 0 };
        if (m.recipient_id === uid && !m.read_at) e.unread++;
        info.set(other, e);
      }
      const out: Row[] = (friends as any[]).map(f => {
        const i = info.get(f.id);
        return { id: f.id, name: f.username || 'Friend', avatar: f.avatar_url ?? null, last: i?.last ?? null, at: i?.at ?? null, unread: i?.unread ?? 0 };
      });
      out.sort((a, b) => (b.at || '').localeCompare(a.at || '') || a.name.localeCompare(b.name));
      setRows(out);
      setError(null);
    } catch {
      setError('Couldn’t load your messages. Check your connection and try again.');
    } finally {
      setReady(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg }}>
      <View style={{ paddingTop: 48, paddingHorizontal: space.md, flexDirection: 'row', alignItems: 'center', maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))} accessibilityRole="button" accessibilityLabel="Back"
          style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={28} color={ink.text} />
        </Pressable>
        <Text accessibilityRole="header" style={[type.label, { flex: 1, textAlign: 'center' }]}>Messages</Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: space.md, paddingBottom: 60, gap: 10, maxWidth: 600, width: '100%', alignSelf: 'center' }}>
        {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[type.small, { color: ink.danger }]}>{error}</Text> : null}

        {ready && rows.length === 0 && !error ? (
          <Card style={{ gap: 8, alignItems: 'center', paddingVertical: space.xl }}>
            <Ionicons name="chatbubbles-outline" size={36} color={ink.moss} />
            <Text style={type.title}>No friends to chat with yet</Text>
            <Text style={[type.small, { textAlign: 'center' }]}>Add a friend and you can chat any time, without being on a walk.</Text>
          </Card>
        ) : null}

        {rows.map(r => (
          <Card key={r.id} onPress={() => router.push({ pathname: '/chat/[friendId]', params: { friendId: r.id, friendName: r.name } } as any)}
            label={`Chat with ${r.name}${r.unread ? `, ${r.unread} new` : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64 }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: ink.cardSolid, alignItems: 'center', justifyContent: 'center' }}>
              {r.avatar ? <Image source={{ uri: r.avatar }} style={{ width: 44, height: 44 }} /> : <Text style={type.label}>{r.name[0].toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.label}>{r.name}</Text>
              <Text style={type.small} numberOfLines={1}>{r.last ?? 'Say hello'}</Text>
            </View>
            {r.unread ? <Badge count={r.unread} style={{ borderColor: ink.cardSolid }} /> : null}
            <Ionicons name="chevron-forward" size={20} color={ink.sub} />
          </Card>
        ))}

        <Button label="Find friends" icon="people-outline" kind="secondary" onPress={() => router.push('/friends')} />
      </ScrollView>
    </View>
  );
}
