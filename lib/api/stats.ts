// lib/api/stats.ts — your own walking history. Private to you: no points, streaks or rankings.
// Signed-in walks are saved to your account; a guest's are kept on this device only.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../supabaseClient';

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

const LOCAL_KEY = 'sparkwalk.localWalks';

async function readLocal(): Promise<Activity[]> {
  try { return JSON.parse((await AsyncStorage.getItem(LOCAL_KEY)) || '[]'); } catch { return []; }
}

/**
 * Save a finished walk. Signed in: to your account. Guest: on this device.
 * `durationSeconds` is the time actually walked (pauses are not counted).
 */
export async function recordWalkActivity(
  durationSeconds: number,
  intervalsCompleted: number,
  sessionId?: string
): Promise<Activity> {
  const { data: { user } } = await supabase.auth.getUser();
  const activity_type = sessionId ? 'group_walk' : 'walk';
  const points = Math.max(1, Math.floor(durationSeconds / 60)); // kept for the database; never shown

  if (!user) {
    const entry: Activity = {
      id: `local-${Date.now()}`, user_id: 'guest', activity_type, duration_seconds: durationSeconds,
      intervals_completed: intervalsCompleted, completed_at: new Date().toISOString(), points,
    };
    const all = [entry, ...(await readLocal())].slice(0, 200);
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    return entry;
  }

  const { data, error } = await supabase
    .from('user_activities')
    .insert({ user_id: user.id, activity_type, duration_seconds: durationSeconds, intervals_completed: intervalsCompleted, session_id: sessionId, points })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Your latest walks, newest first. */
export async function getRecentActivities(limit: number = 10): Promise<Activity[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return (await readLocal()).slice(0, limit);
  const { data, error } = await supabase
    .from('user_activities')
    .select('*')
    .eq('user_id', user.id)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export type Progress = {
  weekSeconds: number; weekWalks: number;
  monthSeconds: number; monthWalks: number;
  /** Monday to Sunday: did you walk that day? */
  days: boolean[];
  /** Index (0 = Monday) of today. */
  today: number;
};

/** Monday 00:00 (your local time) of the week containing `d`. */
export function startOfWeek(d: Date): Date {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7));
  return s;
}

/** Totals for this week and this month, from the time you actually walked. */
export async function getMyProgress(now: Date = new Date()): Promise<Progress> {
  const weekStart = startOfWeek(now);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const since = weekStart < monthStart ? weekStart : monthStart;

  const { data: { user } } = await supabase.auth.getUser();
  let rows: Pick<Activity, 'duration_seconds' | 'completed_at'>[];
  if (!user) {
    rows = (await readLocal()).filter(a => new Date(a.completed_at) >= since);
  } else {
    const { data, error } = await supabase
      .from('user_activities')
      .select('duration_seconds, completed_at')
      .eq('user_id', user.id)
      .gte('completed_at', since.toISOString())
      .order('completed_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    rows = data || [];
  }

  const p: Progress = { weekSeconds: 0, weekWalks: 0, monthSeconds: 0, monthWalks: 0, days: Array(7).fill(false), today: (now.getDay() + 6) % 7 };
  for (const r of rows) {
    const at = new Date(r.completed_at);
    if (at >= monthStart) { p.monthSeconds += r.duration_seconds; p.monthWalks++; }
    if (at >= weekStart) {
      p.weekSeconds += r.duration_seconds; p.weekWalks++;
      p.days[Math.min(6, Math.floor((new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime() - weekStart.getTime()) / 86400000))] = true;
    }
  }
  return p;
}

/** Format duration seconds to a readable string. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
