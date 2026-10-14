// Simple Supabase connection test
require('react-native-url-polyfill/auto');
require('react-native-get-random-values');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

async function testSupabase() {
  console.log('='.repeat(60));
  console.log('🔍 SUPABASE DIAGNOSTICS');
  console.log('='.repeat(60));
  console.log('\n📌 Configuration:');
  console.log('   URL:', SUPABASE_URL);
  console.log('   Key:', SUPABASE_KEY.substring(0, 30) + '...');

  // Test 1: Sign Up
  console.log('\n\n1️⃣ Testing Sign Up...');
  const testEmail = `test${Date.now()}@example.com`;
  const testPassword = 'test123456';
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });

    if (error) {
      console.log('❌ SIGN UP FAILED:');
      console.log('   Message:', error.message);
      console.log('   Status:', error.status);
      console.log('   Details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Sign Up Successful!');
      console.log('   User ID:', data.user?.id);
      console.log('   Email:', data.user?.email);
      console.log('   Email Confirmed:', data.user?.email_confirmed_at ? 'Yes' : 'No');
      
      // Clean up
      await supabase.auth.signOut();
    }
  } catch (e) {
    console.log('❌ FATAL ERROR:', e.message);
  }

  // Test 2: Check Auth Settings
  console.log('\n\n2️⃣ Checking Authentication Status...');
  try {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('   Current Session:', session ? 'Active' : 'None');
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  // Test 3: Database Access
  console.log('\n\n3️⃣ Testing Database Access (profiles table)...');
  try {
    const { data, error } = await supabase.from('profiles').select('id').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ PROFILES TABLE MISSING');
        console.log('   The "profiles" table does not exist in your database');
      } else {
        console.log('❌ Database Error:');
        console.log('   Code:', error.code);
        console.log('   Message:', error.message);
      }
    } else {
      console.log('✅ Profiles table exists and is accessible');
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  // Test 4: Storage
  console.log('\n\n4️⃣ Testing Storage Access...');
  try {
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('❌ Storage Error:', error.message);
    } else {
      console.log('✅ Storage accessible');
      const bucketNames = data.map(b => b.name).join(', ');
      console.log('   Buckets:', bucketNames || 'None');
      
      const avatarBucket = data.find(b => b.name === 'avatars');
      if (!avatarBucket) {
        console.log('   ⚠️  "avatars" bucket not found');
      }
    }
  } catch (e) {
    console.log('❌ Error:', e.message);
  }

  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('📋 SETUP CHECKLIST');
  console.log('='.repeat(60));
  console.log('\n🔧 In Supabase Dashboard (https://supabase.com/dashboard):');
  console.log('\n1. Authentication → Settings → Email Auth');
  console.log('   ☐ Enable Email provider');
  console.log('   ☐ Disable "Confirm email" (for testing)');
  console.log('   ☐ OR configure SMTP settings');
  
  console.log('\n2. SQL Editor → New Query:');
  console.log('   Run this SQL:\n');
  console.log('   CREATE TABLE profiles (');
  console.log('     id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,');
  console.log('     username TEXT,');
  console.log('     avatar_url TEXT,');
  console.log('     bio TEXT,');
  console.log('     created_at TIMESTAMPTZ DEFAULT NOW()');
  console.log('   );');
  console.log('\n   ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;');
  console.log('\n   CREATE POLICY "Users can view own profile"');
  console.log('     ON profiles FOR SELECT USING (auth.uid() = id);');
  console.log('\n   CREATE POLICY "Users can update own profile"');
  console.log('     ON profiles FOR UPDATE USING (auth.uid() = id);');
  console.log('\n   CREATE POLICY "Users can insert own profile"');
  console.log('     ON profiles FOR INSERT WITH CHECK (auth.uid() = id);');
  
  console.log('\n3. Storage → Create bucket:');
  console.log('   ☐ Name: "avatars"');
  console.log('   ☐ Public: Yes');
  console.log('   ☐ File size limit: 5MB');
  console.log('\n' + '='.repeat(60) + '\n');
}

testSupabase();
