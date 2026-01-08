import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, pad, radius, shadow } from '../lib/theme';
import { supabase } from '../lib/supabaseClient';
import { initializePushNotifications } from '../lib/notifications';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
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
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (!validateEmail(email)) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

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
            Alert.alert('Account Exists', 'This email is already registered. Please sign in instead.');
            setIsSignUp(false);
          } else {
            Alert.alert(
              'Success!',
              'Account created successfully! Please check your email to verify your account.',
              [{ text: 'OK', onPress: () => setIsSignUp(false) }]
            );
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
          await initializePushNotifications();
          router.replace('/dashboard');
        }
      }
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <View style={[styles.container, { justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(138,43,226,0.25)', 'rgba(0,234,255,0.10)']}
        style={styles.bgGlow}
        start={{ x: 0.1, y: 0.1 }}
        end={{ x: 0.9, y: 0.9 }}
      />
      <View style={[styles.card, shadow.card]}>
        <Text style={styles.title}>Spark Walk</Text>
        <Text style={styles.subtitle}>
          {isSignUp ? 'Create your account' : 'Intervals made easy.'}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.sub}
            style={styles.input}
            autoCapitalize="none"
            keyboardType="email-address"
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor={colors.sub}
            secureTextEntry
            style={styles.input}
            editable={!loading}
          />
        </View>

        <TouchableOpacity 
          onPress={handleAuth} 
          activeOpacity={0.9}
          disabled={loading}
        >
          <LinearGradient
            colors={[colors.accent, colors.accent2]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.cta, loading && { opacity: 0.6 }]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={colors.text} />
            ) : (
              <Text style={styles.ctaText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setIsSignUp(!isSignUp)}
          style={styles.switchBtn}
          disabled={loading}
        >
          <Text style={styles.switchText}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <Text style={styles.switchTextBold}>
              {isSignUp ? 'Sign In' : 'Sign Up'}
            </Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999 },
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
});
