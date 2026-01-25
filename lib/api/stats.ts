import { supabase } from '../supabaseClient';

export interface UserStats {
  user_id: string;
  total_points: number;
  total_walks: number;
  total_duration_seconds: number;
  current_streak_days: number;
  longest_streak_days: number;
  last_activity_date: string | null;
  updated_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  activity_type: string;
  duration_seconds: number;
  intervals_completed: number;
  session_id?: string;
  completed_at: string;
  points: number;
}

export interface PeriodStats {
  points: number;
  walks: number;
  duration_seconds: number;
}

/**
 * Record a completed walk activity
 */
export async function recordWalkActivity(
  durationSeconds: number,
  intervalsCompleted: number,
  sessionId?: string
): Promise<Activity> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Calculate points (1 point per minute)
  const points = Math.max(1, Math.floor(durationSeconds / 60));

  const { data, error } = await supabase
    .from('user_activities')
    .insert({
      user_id: user.id,
      activity_type: sessionId ? 'group_walk' : 'walk',
      duration_seconds: durationSeconds,
      intervals_completed: intervalsCompleted,
      session_id: sessionId,
      points,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get user's overall statistics
 */
export async function getUserStats(): Promise<UserStats | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle(); // Use maybeSingle instead of single to handle no rows gracefully

  if (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
  return data || null;
}

/**
 * Get statistics for a specific time period
 */
export async function getPeriodStats(period: 'week' | 'month' | 'all'): Promise<PeriodStats> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  let dateFilter = '';
  const now = new Date();

  if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = weekAgo.toISOString();
  } else if (period === 'month') {
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    dateFilter = monthAgo.toISOString();
  }

  let query = supabase
    .from('user_activities')
    .select('points, duration_seconds')
    .eq('user_id', user.id);

  if (dateFilter) {
    query = query.gte('completed_at', dateFilter);
  }

  const { data, error } = await query;

  if (error) throw error;

  const stats = (data || []).reduce(
    (acc, activity) => ({
      points: acc.points + activity.points,
      walks: acc.walks + 1,
      duration_seconds: acc.duration_seconds + activity.duration_seconds,
    }),
    { points: 0, walks: 0, duration_seconds: 0 }
  );

  return stats;
}

/**
 * Get recent activities
 */
export async function getRecentActivities(limit: number = 10): Promise<Activity[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

/**
 * Get leaderboard (top users by points for a period)
 */
export async function getLeaderboard(
  period: 'week' | 'month' | 'all',
  limit: number = 10
): Promise<Array<{ user_id: string; username: string; points: number; walks: number }>> {
  let dateFilter = '';
  const now = new Date();

  if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = weekAgo.toISOString();
  } else if (period === 'month') {
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    dateFilter = monthAgo.toISOString();
  }

  // For all-time, use user_stats table (faster)
  if (period === 'all') {
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, total_points, total_walks')
      .order('total_points', { ascending: false })
      .limit(limit);

    if (error) throw error;

    // Fetch usernames separately
    const userIds = (data || []).map(s => s.user_id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username')
      .in('id', userIds);

    const profileMap = new Map((profiles || []).map(p => [p.id, p.username || 'User']));

    return (data || []).map(s => ({
      user_id: s.user_id,
      username: profileMap.get(s.user_id) || 'User',
      points: s.total_points,
      walks: s.total_walks,
    }));
  }

  // For week/month, aggregate from activities
  let query = supabase
    .from('user_activities')
    .select('user_id, points');

  if (dateFilter) {
    query = query.gte('completed_at', dateFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  // Aggregate by user
  const userScores = new Map<string, { points: number; walks: number }>();
  (data || []).forEach(activity => {
    const current = userScores.get(activity.user_id) || { points: 0, walks: 0 };
    userScores.set(activity.user_id, {
      points: current.points + activity.points,
      walks: current.walks + 1,
    });
  });

  // Sort and limit
  const sorted = Array.from(userScores.entries())
    .map(([user_id, stats]) => ({ user_id, ...stats }))
    .sort((a, b) => b.points - a.points)
    .slice(0, limit);

  // Fetch usernames
  const userIds = sorted.map(s => s.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map(p => [p.id, p.username || 'User']));

  return sorted.map(s => ({
    ...s,
    username: profileMap.get(s.user_id) || 'User',
  }));
}

/**
 * Format duration seconds to readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Get another user's statistics (public profile data)
 */
export async function getUserStatsById(userId: string): Promise<UserStats | null> {
  const { data, error } = await supabase
    .from('user_stats')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching user stats:', error);
    return null;
  }
  return data || null;
}

/**
 * Get a user's leaderboard position
 */
export async function getUserLeaderboardPosition(
  userId: string,
  period: 'week' | 'month' | 'all' = 'all'
): Promise<{ rank: number; totalUsers: number } | null> {
  if (period === 'all') {
    // Use user_stats table for all-time
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, total_points')
      .order('total_points', { ascending: false });

    if (error) return null;

    const rank = (data || []).findIndex(s => s.user_id === userId) + 1;
    return rank > 0 ? { rank, totalUsers: data?.length || 0 } : null;
  }

  // For week/month, aggregate from activities
  let dateFilter = '';
  const now = new Date();

  if (period === 'week') {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFilter = weekAgo.toISOString();
  } else if (period === 'month') {
    const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    dateFilter = monthAgo.toISOString();
  }

  let query = supabase.from('user_activities').select('user_id, points');
  if (dateFilter) {
    query = query.gte('completed_at', dateFilter);
  }

  const { data, error } = await query;
  if (error) return null;

  // Aggregate by user
  const userScores = new Map<string, number>();
  (data || []).forEach(activity => {
    const current = userScores.get(activity.user_id) || 0;
    userScores.set(activity.user_id, current + activity.points);
  });

  // Sort and find position
  const sorted = Array.from(userScores.entries())
    .sort((a, b) => b[1] - a[1]);

  const rank = sorted.findIndex(([id]) => id === userId) + 1;
  return rank > 0 ? { rank, totalUsers: sorted.length } : null;
}
