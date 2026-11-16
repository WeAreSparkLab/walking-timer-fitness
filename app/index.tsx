import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, shadow } from '../lib/theme';
import { supabase } from '../lib/supabaseClient';
import { initializePushNotifications } from '../lib/notifications';
import { setGuest } from '../lib/guest';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [forgot, setForgot] = useState(false);
  // Inline messages: Alert.alert does nothing in a web browser.
  const [message, setMessage] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);
  const router = useRouter();

  // Check if user is already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/dashboard');
      }
      setCheckingSession(false);
    });
  }, []);

  const validateEmail = (email: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleAuth = async () => {
    // Validation
    if (!email.trim()) {
      setMessage({ kind: 'error', text: 'Please enter your email.' });
      return;
    }
    if (!validateEmail(email)) {
      setMessage({ kind: 'error', text: 'That doesn’t look like an email address. Please check it.' });
      return;
    }
    if (!password || password.length < 6) {
      setMessage({ kind: 'error', text: 'Your password needs at least 6 characters.' });
      return;
    }

    setMessage(null);
    setLoading(true);
    try {
      if (isSignUp) {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          // Check if email confirmation is required
          if (data.user.identities && data.user.identities.length === 0) {
            setMessage({ kind: 'info', text: 'This email already has an account. Please sign in, or tap “Forgot your password?” if you need to reset it.' });
            setIsSignUp(false);
          } else {
            setMessage({ kind: 'info', text: 'Account created! Please check your email to confirm it, then sign in.' });
            setIsSignUp(false);

          }
        }
      } else {
        // Sign in
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) throw error;

        if (data.session) {
          // Initialize push notifications after successful sign in
          await setGuest(false); // signed in: no longer just exploring
          await initializePushNotifications();
          router.replace('/dashboard');
        }
      }
    } catch (error: any) {
      const raw = String(error?.message || '');
      setMessage({
        kind: 'error',
        text: /invalid login credentials/i.test(raw)
          ? 'That email and password don’t match. You can try again, or tap “Forgot your password?”.'
          : /email not confirmed/i.test(raw)
            ? 'Please confirm your email first. Check your inbox for the link we sent.'
            : raw || 'Something went wrong. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const addr = email.trim().toLowerCase();
    if (!validateEmail(addr)) {
      setMessage({ kind: 'error', text: 'Enter the email you signed up with, and we’ll send you a link.' });
      return;
    }
    setMessage(null);
    setLoading(true);
    try {
      const origin = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'https://walks.wearesparklab.com';
      const { error } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: `${origin}/reset-password` });
      if (error && /rate limit|only request this once|seconds/i.test(error.message)) {
        setMessage({ kind: 'error', text: 'We’ve only just sent one. Please wait a minute and check your inbox (and spam) before trying again.' });
      } else {
        // Same message whether or not the email has an account, so nobody can use this to find out who has one.
        setMessage({ kind: 'info', text: 'If there’s an account for that email, we’ve sent a link to reset your password. It can take a few minutes, so check your spam folder too.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Couldn’t send the email. Check your connection and try again.' });
    } finally {
      setLoading(false);
    }
  };
  if (checkingSession) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text accessibilityRole="header" style={{ color: colors.text, textAlign: 'center', marginTop: 18 }}>Spark Walk: your interval walking timer</Text>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 12, maxWidth: 520, paddingHorizontal: 24 }}>
          Set a comfortable pace with alternating brisk and easy walking intervals. Follow the sound cues, try the 21-minute default walk, or create a plan that suits your day.
        </Text>
        <Text style={{ color: colors.text, textAlign: 'center', marginTop: 12, maxWidth: 520, paddingHorizontal: 24 }}>
          Spark Walk keeps track of the timing so you can focus on moving. Your walk can be short, gentle, or more energetic — make it work for you.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(242,166,90,0.25)', 'rgba(156,197,161,0.10)']}
        style={styles.bgGlow}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
      />
      <View style={[styles.card, shadow.card]}>
        <Text style={styles.title}>Spark Walk</Text>
        <Text style={styles.subtitle}>
          {forgot ? 'Reset your password' : isSignUp ? 'Create your account' : 'Intervals made easy.'}
        </Text>

        {forgot ? (
          <Text style={[styles.subtitle, { marginTop: -10, color: colors.text }]}>
            Enter your email and we’ll send you a link to choose a new password.
          </Text>
        ) : null}

        <View style={styles.field}>
          <Text nativeID="loginEmailLabel" style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.sub}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            accessibilityLabelledBy="loginEmailLabel"
            onSubmitEditing={forgot ? handleReset : undefined}
            editable={!loading}
          />
        </View>

        {!forgot ? (
          <View style={styles.field}>
            <Text nativeID="loginPasswordLabel" style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor={colors.sub}
              secureTextEntry
              style={styles.input}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              accessibilityLabelledBy="loginPasswordLabel"
              onSubmitEditing={handleAuth}
              editable={!loading}
            />
            {!isSignUp ? (
              <TouchableOpacity onPress={() => { setForgot(true); setMessage(null); }} disabled={loading} accessibilityRole="button" style={styles.forgotBtn}>
                <Text style={styles.forgotText}>Forgot your password?</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {message ? (
          <View accessibilityLiveRegion="polite" accessibilityRole={message.kind === 'error' ? 'alert' : undefined}
            style={[styles.msg, message.kind === 'error' ? styles.msgError : styles.msgInfo]}>
            <Text style={styles.msgText}>{message.text}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          onPress={forgot ? handleReset : handleAuth}
          activeOpacity={0.9}
          disabled={loading}
          accessibilityRole="button"
        >
          <LinearGradient
            colors={[colors.accent, '#8E4214']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.cta, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.ctaText}>
                {forgot ? 'Send reset link' : isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        {forgot ? (
          <TouchableOpacity onPress={() => { setForgot(false); setMessage(null); }} style={styles.switchBtn} disabled={loading} accessibilityRole="button">
            <Text style={styles.switchText}>
              Remembered it? <Text style={styles.switchTextBold}>Back to sign in</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => { setIsSignUp(!isSignUp); setMessage(null); }}
            style={styles.switchBtn}
            disabled={loading}
            accessibilityRole="button"
          >
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchTextBold}>
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </TouchableOpacity>
        )}

        {!forgot ? (
          <View style={{ marginTop: 8, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.line, alignItems: 'center' }}>
            <TouchableOpacity
              onPress={async () => { await setGuest(true); router.replace('/dashboard'); }}
              disabled={loading}
              accessibilityRole="button"
              accessibilityHint="Look around without creating an account"
              style={{ minHeight: 48, justifyContent: 'center' }}
            >
              <Text style={styles.switchText}>Just looking? <Text style={[styles.switchTextBold, { textDecorationLine: 'underline' }]}>Explore as a guest</Text></Text>
            </TouchableOpacity>
            <Text style={{ color: colors.sub, fontSize: 12, textAlign: 'center', marginTop: 2 }}>No account needed. Walk on your own, build walks and try the worlds.</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: pad.lg },
  bgGlow: { display: 'none',  opacity: 0.3,  position: 'absolute', width: '120%', height: '120%', borderRadius: 999 },
  card: {
    width: '100%', maxWidth: 480, backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.xl,
    borderWidth: 1, borderColor: colors.line,
  },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: colors.sub, marginTop: 6, marginBottom: 22 },
  field: { marginBottom: 16 },
  label: { color: colors.sub, marginBottom: 8, fontSize: 12, letterSpacing: 0.3 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: colors.text, borderRadius: radius.md, paddingHorizontal: 14, height: 46,
  },
  cta: { marginTop: 10, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { color: colors.sub, fontSize: 14 },
  switchTextBold: { color: colors.text, fontWeight: '700' },
  forgotBtn: { alignSelf: 'flex-end', minHeight: 44, justifyContent: 'center', marginTop: 4 },
  forgotText: { color: colors.text, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  msg: { borderRadius: radius.md, padding: 14, marginBottom: 6, borderWidth: 1 },
  msgError: { backgroundColor: 'rgba(255,138,122,0.10)', borderColor: 'rgba(255,138,122,0.5)' },
  msgInfo: { backgroundColor: 'rgba(156,197,161,0.12)', borderColor: 'rgba(156,197,161,0.5)' },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
