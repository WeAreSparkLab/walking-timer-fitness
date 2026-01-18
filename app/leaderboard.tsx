// app/leaderboard.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, pad, shadow } from '../lib/theme';
import { getLeaderboard } from '../lib/api/stats';
import { supabase } from '../lib/supabaseClient';

type LeaderboardEntry = {
  user_id: string;
  username: string;
  points: number;
  walks: number;
};

export default function Leaderboard() {
  const router = useRouter();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user?.id || null);
    });
  }, []);

  useEffect(() => {
    loadLeaderboard();
  }, [selectedPeriod]);

  async function loadLeaderboard() {
    try {
      setLoading(true);
      const data = await getLeaderboard(selectedPeriod, 50);
      setLeaderboard(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }

  function getRankMedal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}`;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <TouchableOpacity 
          style={[styles.periodBtn, selectedPeriod === 'week' && styles.periodBtnActive]}
          onPress={() => setSelectedPeriod('week')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'week' && styles.periodTextActive]}>Week</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.periodBtn, selectedPeriod === 'month' && styles.periodBtnActive]}
          onPress={() => setSelectedPeriod('month')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'month' && styles.periodTextActive]}>Month</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.periodBtn, selectedPeriod === 'all' && styles.periodBtnActive]}
          onPress={() => setSelectedPeriod('all')}
        >
          <Text style={[styles.periodText, selectedPeriod === 'all' && styles.periodTextActive]}>All Time</Text>
        </TouchableOpacity>
      </View>

      {/* Leaderboard List */}
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : leaderboard.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No rankings yet</Text>
          </View>
        ) : (
          leaderboard.map((entry, index) => {
            const rank = index + 1;
            const isCurrentUser = entry.user_id === currentUserId;
            
            return (
              <View 
                key={entry.user_id} 
                style={[
                  styles.leaderboardCard,
                  isCurrentUser && styles.currentUserCard,
                  shadow.card
                ]}
              >
                {/* Rank */}
                <View style={styles.rankContainer}>
                  {rank <= 3 ? (
                    <Text style={styles.rankMedal}>{getRankMedal(rank)}</Text>
                  ) : (
                    <Text style={styles.rankNumber}>{rank}</Text>
                  )}
                </View>

                {/* User Info */}
                <View style={styles.userInfo}>
                  <Text style={[styles.username, isCurrentUser && styles.currentUserText]}>
                    {entry.username}
                    {isCurrentUser && <Text style={styles.youBadge}> (You)</Text>}
                  </Text>
                  <Text style={styles.userMeta}>{entry.walks} walks</Text>
                </View>

                {/* Points */}
                <View style={styles.pointsContainer}>
                  <Text style={[styles.points, isCurrentUser && styles.currentUserText]}>
                    {entry.points}
                  </Text>
                  <Text style={styles.pointsLabel}>pts</Text>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: pad.lg,
    paddingTop: pad.xl,
    paddingBottom: pad.md,
    backgroundColor: colors.bg,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: pad.lg,
    marginBottom: pad.md,
  },
  periodBtn: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  periodBtnActive: {
    backgroundColor: colors.accent + '20',
    borderColor: colors.accent,
  },
  periodText: {
    color: colors.sub,
    fontSize: 14,
    fontWeight: '600',
  },
  periodTextActive: {
    color: colors.accent,
  },
  content: {
    flex: 1,
    paddingHorizontal: pad.lg,
  },
  loadingContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyContainer: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.sub,
    fontSize: 16,
  },
  leaderboardCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: pad.md,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  currentUserCard: {
    backgroundColor: colors.accent + '10',
    borderColor: colors.accent,
    borderWidth: 2,
  },
  rankContainer: {
    width: 50,
    alignItems: 'center',
  },
  rankMedal: {
    fontSize: 32,
  },
  rankNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.sub,
  },
  userInfo: {
    flex: 1,
    marginLeft: pad.sm,
  },
  username: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  currentUserText: {
    color: colors.accent,
    fontWeight: '700',
  },
  youBadge: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  userMeta: {
    fontSize: 12,
    color: colors.sub,
    marginTop: 2,
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  points: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  pointsLabel: {
    fontSize: 12,
    color: colors.sub,
    marginTop: 2,
  },
});
