// app/classic-dashboard.tsx — the previous home screen has been retired.
// Kept as a redirect so old links and bookmarks still work.
import { Redirect } from 'expo-router';

export default function ClassicDashboardRedirect() {
  return <Redirect href="/dashboard" />;
}