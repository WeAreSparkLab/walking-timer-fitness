//lib/useMyProfile.ts
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabaseClient';
import { getMyProfile } from './api/profile';
import { loadLocalProfile } from './profileLocal';

export function useMyProfile() {
  const [id, setId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const p = await getMyProfile().catch(() => null);
          if (alive && p) {
            setId(p.id);
            setUsername(p.username ?? null);
            setAvatarUrl(p.avatar_url ?? null);
            return;
          }
        }
        const lp = await loadLocalProfile();
        if (alive && lp) {
          setId(lp.id ?? null);
          setUsername(lp.username ?? null);
          setAvatarUrl(lp.avatar_url ?? null);
        }
      })();
      return () => { alive = false; };
    }, [])
  );

  return { id, username, avatarUrl, profile: { id, username, avatar_url: avatarUrl } };
}
