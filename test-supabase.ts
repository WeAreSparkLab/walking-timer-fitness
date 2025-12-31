// Test Supabase connection and setup
import { supabase } from './lib/supabaseClient';

async function testSupabaseSetup() {
  console.log('🔍 Testing Supabase Configuration...\n');

  // 1. Test connection
  console.log('1️⃣ Testing Supabase Connection...');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.log('❌ Connection Error:', error.message);
    } else {
      console.log('✅ Connected to Supabase');
      console.log('   Session:', data.session ? 'Active' : 'None');
    }
  } catch (e: any) {
    console.log('❌ Fatal Error:', e.message);
  }

  // 2. Test sign up
  console.log('\n2️⃣ Testing Sign Up...');
  const testEmail = `test${Date.now()}@example.com`;
  const testPassword = 'test123456';
  
  try {
    const { data, error } = await supabase.auth.signUp({
      email: testEmail,
      password: testPassword,
    });

    if (error) {
      console.log('❌ Sign Up Error:', error.message);
      console.log('   Error Details:', JSON.stringify(error, null, 2));
    } else {
      console.log('✅ Sign Up Successful');
      console.log('   User ID:', data.user?.id);
      console.log('   Email:', data.user?.email);
      console.log('   Needs Confirmation:', data.user?.identities?.length === 0);
      
      // Clean up - sign out
      await supabase.auth.signOut();
    }
  } catch (e: any) {
    console.log('❌ Fatal Error:', e.message);
  }

  // 3. Check profiles table
  console.log('\n3️⃣ Testing Profiles Table Access...');
  try {
    const { data, error } = await supabase.from('profiles').select('count');
    
    if (error) {
      if (error.code === '42P01') {
        console.log('❌ Profiles table does not exist');
        console.log('   You need to create the profiles table in Supabase');
      } else if (error.code === 'PGRST116') {
        console.log('⚠️  Profiles table exists but is empty (this is OK for a new project)');
      } else {
        console.log('❌ Profiles Table Error:', error.message);
        console.log('   Error Code:', error.code);
      }
    } else {
      console.log('✅ Profiles table accessible');
    }
  } catch (e: any) {
    console.log('❌ Fatal Error:', e.message);
  }

  // 4. Check storage bucket
  console.log('\n4️⃣ Testing Storage Bucket...');
  try {
    const { data, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.log('❌ Storage Error:', error.message);
    } else {
      const avatarBucket = data.find(b => b.name === 'avatars');
      if (avatarBucket) {
        console.log('✅ Avatars bucket exists');
        console.log('   Public:', avatarBucket.public);
      } else {
        console.log('⚠️  Avatars bucket not found');
        console.log('   Available buckets:', data.map(b => b.name).join(', ') || 'None');
      }
    }
  } catch (e: any) {
    console.log('❌ Fatal Error:', e.message);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📋 SUMMARY & NEXT STEPS:');
  console.log('='.repeat(50));
  console.log('\nIf you see errors above, check:');
  console.log('1. Supabase Dashboard → Authentication → Providers');
  console.log('   - Enable Email provider');
  console.log('   - Disable email confirmation (for testing) or configure SMTP');
  console.log('\n2. Supabase Dashboard → SQL Editor');
  console.log('   - Run the SQL from AUTHENTICATION.md to create profiles table');
  console.log('\n3. Supabase Dashboard → Storage');
  console.log('   - Create "avatars" bucket (public)');
  console.log('\n4. Check your .env file has correct credentials');
}

testSupabaseSetup();
