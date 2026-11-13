// app/start-group-walk.tsx — replaced by /together/new. Kept for old links.
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

export default function StartGroupWalkRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/together/new'); }, []);
  return <View style={{ flex: 1, backgroundColor: '#0D1310' }} />;
}