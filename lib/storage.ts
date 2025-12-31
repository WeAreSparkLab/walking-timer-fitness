// lib/storage.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Pace = 'WARMUP' | 'FAST' | 'SLOW' | 'COOLDOWN';

export type Interval = { pace: Pace; minutes: number; seconds: number };
export type WalkPlan = {
  id: string;
  name: string;
  intervals: Interval[];
  createdAt: number;
};

const KEY = 'sparkwalk.plans.v1';

export async function getPlans(): Promise<WalkPlan[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}
export async function savePlan(plan: WalkPlan) {
  const plans = await getPlans();
  const next = [plan, ...plans.filter(p => p.id !== plan.id)];
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
}
export async function removePlan(id: string) {
  const plans = await getPlans();
  await AsyncStorage.setItem(KEY, JSON.stringify(plans.filter(p => p.id !== id)));
}
export async function getPlanById(id: string) {
  const plans = await getPlans();
  return plans.find(p => p.id === id) || null;
}
