// lib/recovery.ts — make sure a password-reset email link always reaches the reset screen.
//
// The link in the email returns to the app with the sign-in tokens in the address
// after the "#". Where it lands depends on Supabase's redirect settings: if
// /reset-password isn't on the allow-list it falls back to the site's home page.
// Either way, send it to /reset-password (keeping the tokens) before anything else
// runs, so the person never ends up on the sign-in page wondering what happened.
import { Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const { pathname, hash } = window.location;
    const isRecovery = /[#&]type=recovery\b/.test(hash) || /[#&]error_code=otp_expired\b/.test(hash);
    if (isRecovery && pathname !== '/reset-password') {
      window.location.replace('/reset-password' + hash);
    }
  } catch {}
}
