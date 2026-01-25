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
  try {
    const raw = await AsyncStorage.getItem(KEY);
    console.log('📦 getPlans - raw data:', raw);
    if (!raw) return [];
    const plans = JSON.parse(raw);
    console.log('📦 getPlans - parsed:', plans.length, 'plans');
    return plans;
  } catch (error) {
    console.error('❌ getPlans error:', error);
    return [];
  }
}
export async function savePlan(plan: WalkPlan) {
  try {
    const plans = await getPlans();
    const next = [plan, ...plans.filter(p => p.id !== plan.id)];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    console.log('✅ savePlan - saved:', plan.name, '| Total plans:', next.length);
  } catch (error) {
    console.error('❌ savePlan error:', error);
  }
}
export async function removePlan(id: string) {
  const plans = await getPlans();
  await AsyncStorage.setItem(KEY, JSON.stringify(plans.filter(p => p.id !== id)));
}
export async function getPlanById(id: string) {
  const plans = await getPlans();
  return plans.find(p => p.id === id) || null;
}
