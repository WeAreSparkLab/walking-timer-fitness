// lib/guest.ts — "Explore as a guest": use Spark Walk without an account.
// Guests can use the timer, the walk builder and the worlds on this device. Anything that needs
// an account (walking together, friends, history across devices) asks them to sign in first.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sparkwalk.guest';
let guest = false;
const subs = new Set<(g: boolean) => void>();

export async function loadGuest(): Promise<boolean> {
  try { guest = (await AsyncStorage.getItem(KEY)) === '1'; } catch {}
  return guest;
}

export async function setGuest(on: boolean) {
  guest = on;
  try { if (on) await AsyncStorage.setItem(KEY, '1'); else await AsyncStorage.removeItem(KEY); } catch {}
  subs.forEach(s => s(on));
}

export function useGuest(): boolean {
  const [g, setG] = useState(guest);
  useEffect(() => {
    loadGuest().then(setG);
    subs.add(setG);
    return () => { subs.delete(setG); };
  }, []);
  return g;
}