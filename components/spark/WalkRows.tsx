// components/spark/WalkRows.tsx — the walk and group-walk rows on the home screen.
// Each has an 'are you sure?' step before anything is deleted or left.
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ink, round } from '../../lib/spark/tokens';
import { Button, Card, Timeline, type } from './ui';

export function WalkRow({ name, sub, segs, onPress, onEdit, onDelete }: { name: string; sub: string; segs: any[]; onPress: () => void; onEdit?: () => void; onDelete?: () => void }) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Card onPress={onPress} label={`Start ${name}. ${sub}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={type.label}>{name}</Text>
          <Text style={type.small}>{sub}</Text>
        </View>
        {onEdit ? (
          <Pressable onPress={onEdit} accessibilityRole="button" accessibilityLabel={`Edit ${name}`} hitSlop={4}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={22} color={ink.sub} />
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={`Delete ${name}`} hitSlop={4}
            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="trash-outline" size={22} color={ink.danger} />
          </Pressable>
        ) : null}
        <Ionicons name="play-circle" size={34} color={ink.ember} />
      </View>
      {confirming && onDelete ? (
        <View style={{ gap: 10, padding: 12, borderRadius: round.sm, borderWidth: 1, borderColor: 'rgba(255,138,122,0.5)' }}>
          <Text accessibilityLiveRegion="polite" style={type.label}>Delete “{name}”? This can’t be undone.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Keep it" kind="secondary" style={{ flex: 1 }} onPress={() => setConfirming(false)} />
            <Button label="Delete" kind="danger" style={{ flex: 1 }} onPress={onDelete} />
          </View>
        </View>
      ) : (
        <Timeline segments={segs} height={22} />
      )}
    </Card>
  );
}

/** One of your group walks: tap to open; the trash (host) or exit (walker) button asks first. */
export function GroupRow({ name, sub, isHost, onOpen, onRemove, onAgain }: { name: string; sub: string; isHost: boolean; onOpen: () => void; onRemove: () => Promise<void>; onAgain?: () => Promise<void> }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [again, setAgain] = useState(false);
  return (
    <Card onPress={onOpen} label={`Open group walk ${name}. ${sub}`} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 56 }}>
        <Ionicons name={isHost ? 'star-outline' : 'people-outline'} size={22} color={ink.moss} style={{ marginRight: 8 }} />
        <View style={{ flex: 1 }}>
          <Text style={type.label} numberOfLines={1}>{name}</Text>
          <Text style={type.small}>{sub}</Text>
        </View>
        <Pressable onPress={() => setConfirming(true)} accessibilityRole="button" accessibilityLabel={isHost ? `Delete group walk ${name}` : `Leave group walk ${name}`} hitSlop={4}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isHost ? 'trash-outline' : 'exit-outline'} size={22} color={ink.danger} />
        </Pressable>
        <Ionicons name="chevron-forward" size={20} color={ink.sub} />
      </View>
      {onAgain ? (
        <Button label={again ? 'Setting up…' : 'Walk again'} icon="refresh" kind="secondary" disabled={again}
          onPress={async () => { setAgain(true); try { await onAgain(); } finally { setAgain(false); } }} a11yHint="Starts a new group walk with the same plan" />
      ) : null}
      {confirming ? (
        <View style={{ gap: 10, padding: 12, borderRadius: round.sm, borderWidth: 1, borderColor: 'rgba(255,138,122,0.5)' }}>
          <Text accessibilityLiveRegion="polite" style={type.label}>
            {isHost ? `Delete “${name}” for everyone? Anyone who joined will lose access.` : `Leave “${name}”? You’ll need a new invitation to rejoin.`}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label={isHost ? 'Keep it' : 'Stay'} kind="secondary" style={{ flex: 1 }} onPress={() => setConfirming(false)} />
            <Button label={busy ? 'Working…' : isHost ? 'Delete' : 'Leave'} kind="danger" style={{ flex: 1 }} disabled={busy}
              onPress={async () => { setBusy(true); try { await onRemove(); } finally { setBusy(false); setConfirming(false); } }} />
          </View>
        </View>
      ) : null}
    </Card>
  );
}
