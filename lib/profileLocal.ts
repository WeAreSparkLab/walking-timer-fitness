//lib/profileLocal.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sparkwalk.local.profile.v1';

export type LocalProfile = {
  username?: string | null;
  avatar_url?: string | null; // can be file:// or https://
  bio?: string | null;
};

export async function loadLocalProfile(): Promise<LocalProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch {
    return null;
  }
}

export async function saveLocalProfile(patch: LocalProfile) {
  const current = (await loadLocalProfile()) ?? {};
  const next = { ...current, ...patch };
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export async function clearLocalProfile() {
  await AsyncStorage.removeItem(KEY);
}
