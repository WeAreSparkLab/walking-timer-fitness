//app/profile.tsx
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors, pad, radius } from '../lib/theme';
import { upsertMyProfile, getMyProfile } from '../lib/api/profile';
import { loadLocalProfile, saveLocalProfile } from '../lib/profileLocal';
import { supabase } from '../lib/supabaseClient';

async function uploadAvatarIfNeeded(uri: string, userId: string) {
  if (/^https?:\/\//i.test(uri)) return uri;

  const resp = await fetch(uri);
  const blob = await resp.blob();

  const mime = (blob as any).type || 'image/jpeg';
  const subtype = mime.split('/')[1] || 'jpeg';
  const ext = subtype === 'jpeg' ? 'jpg' : subtype;

  const objectKey = `${userId}-${Date.now()}.${ext}`;

  const { data, error } = await supabase
    .storage
    .from('avatars')
    .upload(objectKey, blob, { upsert: true, contentType: mime });

  if (error) throw error;

  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(data.path);
  return pub.publicUrl;
}

export default function ProfileScreen() {
  const router = useRouter();
  const [authed, setAuthed] = useState(false);

  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(''); // this drives the preview

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [hasLocal, setHasLocal] = useState(false);

  // Load on mount
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setAuthed(!!session);
      if (session) {
        const p = await getMyProfile().catch(() => null);
        if (p) {
          setUsername(p.username ?? '');
          setBio(p.bio ?? '');
          setAvatarUrl(p.avatar_url ?? '');
        }
      } else {
        const lp = await loadLocalProfile();
        if (lp) {
          setUsername(lp.username ?? '');
          setBio(lp.bio ?? '');
          setAvatarUrl(lp.avatar_url ?? '');
        }
      }
      const lp2 = await loadLocalProfile();
      setHasLocal(!!lp2 && (!!lp2.username || !!lp2.bio || !!lp2.avatar_url));
    })();
  }, []);

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow photo access to set an avatar.');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true, aspect: [1, 1], quality: 0.85,
    });
    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];

    // UPDATE PREVIEW IMMEDIATELY
    setAvatarUrl(asset.uri);
    await saveLocalProfile({ avatar_url: asset.uri, username, bio });

    if (!authed) {
      Alert.alert('Saved locally', 'Avatar saved locally. Sign in to sync.');
      return;
    }

    try {
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const publicUrl = await uploadAvatarIfNeeded(asset.uri, user.id);
      setAvatarUrl(publicUrl);
      await upsertMyProfile({ avatar_url: publicUrl });
      await saveLocalProfile({ avatar_url: publicUrl });
      Alert.alert('Avatar updated', 'Looking sharp.');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload avatar.');
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    setSaving(true);
    try {
      const payload = { username: username?.trim() || null, bio: bio || null, avatar_url: avatarUrl || null };
      await saveLocalProfile(payload);

      if (authed) {
        await upsertMyProfile(payload);
      }
      
      router.replace('/dashboard');
    } catch (e: any) {
      console.error('Save error:', e);
      Alert.alert('Error', e.message ?? 'Could not save profile.');
    } finally {
      setSaving(false);
    }
  }

  async function doSignIn() {
    try {
      setAuthBusy(true);
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setAuthed(true);
      // ensure profile row exists + pull it
      await upsertMyProfile({});
      const p = await getMyProfile().catch(() => null);
      if (p) {
        setUsername(p.username ?? '');
        setBio(p.bio ?? '');
        setAvatarUrl(p.avatar_url ?? '');
      }
      Alert.alert('Welcome', 'Signed in successfully.');
    } catch (e: any) {
      Alert.alert('Sign-in failed', e.message ?? 'Check your email and password.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function doSignUp() {
    try {
      setAuthBusy(true);
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) throw error;
      if (!data.session) {
        Alert.alert('Check your email', 'Confirm your address to finish signing up.');
      } else {
        await upsertMyProfile({});
        Alert.alert('Account created', 'You are signed in.');
        setAuthed(true);
      }
    } catch (e: any) {
      Alert.alert('Sign-up failed', e.message ?? 'Could not create account.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function doSignOut() {
    try {
      setAuthBusy(true);
      await supabase.auth.signOut();
      setAuthed(false);
      Alert.alert('Signed out', 'See you soon.');
    } catch (e: any) {
      Alert.alert('Sign-out failed', e.message ?? 'Try again.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function syncLocalToCloud() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return Alert.alert('Not signed in', 'Sign in to sync.');
      const lp = await loadLocalProfile();
      if (!lp) return Alert.alert('Nothing to sync', 'No local profile found.');
      setSaving(true);
      let avatar = lp.avatar_url || null;
      if (avatar && avatar.startsWith('file://')) {
        avatar = await uploadAvatarIfNeeded(avatar, user.id);
        setAvatarUrl(avatar); // update preview to hosted
      }
      await upsertMyProfile({ username: lp.username ?? null, bio: lp.bio ?? null, avatar_url: avatar });
      await saveLocalProfile({ username: lp.username ?? null, bio: lp.bio ?? null, avatar_url: avatar ?? null });
      Alert.alert('Synced', 'Your local profile is now saved to the cloud.');
      setHasLocal(false);
    } catch (e: any) {
      Alert.alert('Sync failed', e.message ?? 'Could not sync your profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient colors={['rgba(138,43,226,0.2)', 'rgba(0,234,255,0.08)']} style={styles.bgGlow} />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Account (sign in/up or sign out) */}
      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Account</Text>
        {authed ? (
          <View style={{ gap: 8 }}>
            <Text style={styles.hint}>You’re signed in.</Text>
            <TouchableOpacity onPress={doSignOut} disabled={authBusy} style={styles.outlineBtn}>
              <Ionicons name="log-out-outline" size={16} color={colors.text} />
              <Text style={styles.outlineBtnText}>{authBusy ? 'Signing out…' : 'Sign out'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.sub}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Your password"
              placeholderTextColor={colors.sub}
              style={styles.input}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={doSignIn} disabled={authBusy} style={[styles.flex1, { overflow: 'hidden', borderRadius: radius.md }]}>
                <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.ctaBtn}>
                  <Text style={styles.ctaBtnText}>{authBusy ? '…' : 'Sign in'}</Text>
                </LinearGradient>
              </TouchableOpacity>
              <TouchableOpacity onPress={doSignUp} disabled={authBusy} style={styles.outlineBtn}>
                <Ionicons name="person-add-outline" size={16} color={colors.text} />
                <Text style={styles.outlineBtnText}>Create account</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>

      {/* Avatar */}
      <View style={styles.avatarRow}>
        <View style={styles.avatarWrap}>
          {avatarUrl
            ? <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            : <Ionicons name="person-circle-outline" size={72} color={colors.sub} />
          }
        </View>
        <TouchableOpacity onPress={pickPhoto} style={styles.pickBtn} activeOpacity={0.85}>
          <Ionicons name="image-outline" size={16} color={colors.accent} />
          <Text style={styles.pickText}>Pick Photo</Text>
        </TouchableOpacity>
      </View>

      {/* Profile fields */}
      <View style={styles.block}>
        <Text style={styles.label}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="yourname"
          placeholderTextColor={colors.sub}
          style={styles.input}
          autoCapitalize="none"
        />
        <Text style={styles.hint}>Shown to friends. 3–24 chars. Lowercase recommended.</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.label}>Bio (optional)</Text>
        <TextInput
          value={bio}
          onChangeText={setBio}
          placeholder="Say hi 👋"
          placeholderTextColor={colors.sub}
          style={[styles.input, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
          multiline
        />
      </View>

      <TouchableOpacity onPress={onSave} activeOpacity={0.9} disabled={saving} style={{ marginTop: 10 }}>
        <LinearGradient colors={[colors.accent, colors.accent2]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.saveBtn}>
          <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
        </LinearGradient>
      </TouchableOpacity>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: pad.lg },
  bgGlow: { position: 'absolute', width: '120%', height: '120%', borderRadius: 999, left: -40, top: -60 },
  header: { paddingTop: 56, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },

  sectionLabel: { color: colors.text, fontWeight: '800', marginBottom: 8 },
  block: { backgroundColor: colors.card, borderRadius: radius.lg, padding: pad.md, borderWidth: 1, borderColor: colors.line, marginBottom: 14 },
  label: { color: colors.sub, marginBottom: 8, fontSize: 12, letterSpacing: 0.3 },
  hint: { color: colors.sub, marginTop: 6, fontSize: 12 },

  input: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    color: colors.text, borderRadius: radius.md, paddingHorizontal: 14, height: 46, marginBottom: 10,
  },

  ctaBtn: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText: { color: colors.text, fontWeight: '800' },
  outlineBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  outlineBtnText: { color: colors.text, fontWeight: '800' },
  flex1: { flex: 1 },

  avatarRow: { alignItems: 'center', marginBottom: 14, marginTop: 6 },
  avatarWrap: { width: 90, height: 90, borderRadius: 45, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)' },
  avatar: { width: '100%', height: '100%', resizeMode: 'cover' },
  pickBtn: {
    marginTop: 10, borderRadius: radius.md, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.accent,
    backgroundColor: 'rgba(255,255,255,0.03)', flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  pickText: { color: colors.accent, fontWeight: '700' },

  saveBtn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: colors.text, fontWeight: '800' },
});
