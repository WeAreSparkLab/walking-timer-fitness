// app/reset-password.tsx — choose a new password after following the email link.
// The link carries a short-lived recovery session in the address (after the "#").
// The app doesn't read tokens from the address globally (detectSessionInUrl is off),
// so this screen picks them up itself, then removes them from the address bar.
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabaseClient';
import { ink, round, space } from '../lib/spark/tokens';
import { Button, type, useSparkFonts } from '../components/spark/ui';

type State = 'checking' | 'ready' | 'expired' | 'saving' | 'done';

export default function ResetPassword() {
  useSparkFonts();
  const router = useRouter();
  const [state, setState] = useState<State>('checking');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') return setState('expired');
      const params = new URLSearchParams(window.location.hash.replace(/^#/, '') || window.location.search.replace(/^\?/, ''));
      const access = params.get('access_token');
      const refresh = params.get('refresh_token');
      const failed = params.get('error') || params.get('error_code');
      // Remove the tokens from the address bar straight away.
      try { window.history.replaceState(null, '', window.location.pathname); } catch {}

      if (access && refresh && params.get('type') === 'recovery') {
        const { error: e } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
        return setState(e ? 'expired' : 'ready');
      }
      if (failed) return setState('expired');
      // Reloaded the page after the link was used: the recovery session is still saved.
      const { data: { session } } = await supabase.auth.getSession();
      setState(session ? 'ready' : 'expired');
    })();
  }, []);

  const save = async () => {
    if (pw.length < 6) return setError('Your new password needs at least 6 characters.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setError(null);
    setState('saving');
    const { error: e } = await supabase.auth.updateUser({ password: pw });
    if (e) {
      setError(/different from the old/i.test(e.message) ? 'Please choose a password you haven’t used before.' : e.message || 'Couldn’t save your new password. Please try again.');
      return setState('ready');
    }
    setState('done');
  };

  const input = { minHeight: 54, borderRadius: round.sm, borderWidth: 1, borderColor: ink.line, color: ink.text, paddingHorizontal: 14, fontSize: 17, backgroundColor: 'rgba(0,0,0,0.2)' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: ink.bg, alignItems: 'center', justifyContent: 'center', padding: space.md }}>
      <View style={{ width: '100%', maxWidth: 480, gap: 16, backgroundColor: ink.card, borderRadius: round.lg, borderWidth: 1, borderColor: ink.line, padding: space.lg }}>
        {state === 'checking' ? (
          <View style={{ alignItems: 'center', gap: 12 }}><ActivityIndicator color={ink.ember} /><Text style={type.body}>Checking your link…</Text></View>
        ) : state === 'expired' ? (
          <>
            <Text accessibilityRole="header" style={type.title}>This link has expired</Text>
            <Text style={type.body}>Password links work once and only for a short time. Go back to sign in and choose “Forgot your password?” to get a new one.</Text>
            <Button label="Back to sign in" onPress={() => router.replace('/')} />
          </>
        ) : state === 'done' ? (
          <>
            <Text accessibilityRole="header" style={type.title}>Password updated</Text>
            <Text style={type.body}>You’re signed in with your new password.</Text>
            <Button label="Continue to Spark Walk" onPress={() => router.replace('/dashboard')} />
          </>
        ) : (
          <>
            <Text accessibilityRole="header" style={type.title}>Choose a new password</Text>
            <View style={{ gap: 8 }}>
              <Text nativeID="npw" style={type.label}>New password</Text>
              <TextInput value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" accessibilityLabelledBy="npw"
                placeholder="At least 6 characters" placeholderTextColor={ink.faint} style={input} editable={state === 'ready'} />
            </View>
            <View style={{ gap: 8 }}>
              <Text nativeID="npw2" style={type.label}>Type it again</Text>
              <TextInput value={pw2} onChangeText={setPw2} secureTextEntry autoComplete="new-password" accessibilityLabelledBy="npw2"
                onSubmitEditing={save} placeholder="Same password" placeholderTextColor={ink.faint} style={input} editable={state === 'ready'} />
            </View>
            {error ? <Text accessibilityLiveRegion="polite" accessibilityRole="alert" style={[type.small, { color: ink.danger }]}>{error}</Text> : null}
            <Button label={state === 'saving' ? 'Saving…' : 'Save new password'} disabled={state === 'saving'} onPress={save} />
          </>
        )}
      </View>
    </View>
  );
}
