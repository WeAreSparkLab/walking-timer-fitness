import * as Linking from 'expo-linking';
import { Share, Platform } from 'react-native';
import { createSession, createInvite, IntervalDTO } from '../api/sessions';

// Plan = array of { pace, minutes, seconds }
export async function createAndShareInvite(name: string, plan: IntervalDTO[]) {
  // 1) Create session (host auto-joins)
  const session = await createSession(name, plan);

  // 2) Create/ensure an invite token
  const token = await createInvite(session.id);

  // 3) Build deep link: sparkwalk://join/<token>
  const deepLink = Linking.createURL(`/join/${token}`);

  // 4) Share it (fallback on web)
  try {
    await Share.share({ message: `Join my walk: ${deepLink}` });
  } catch {
    if (Platform.OS === 'web') {
      await navigator.clipboard?.writeText?.(deepLink);
      alert('Invite link copied:\n' + deepLink);
    } else {
      throw new Error('Could not open share sheet.');
    }
  }

  return { sessionId: session.id, deepLink };
}
