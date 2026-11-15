// lib/analytics.ts — Vercel Web Analytics (web only, cookie-free page views).
// Invitation codes and walk IDs are private, so they are replaced before
// anything leaves the device; query strings are dropped entirely.
import { Platform } from 'react-native';

let started = false;

export function redactUrl(raw: string) {
  try {
    const u = new URL(raw);
    u.search = '';
    u.hash = '';
    u.pathname = u.pathname
      .replace(/^\/join\/[^/]+/, '/join/[token]')
      .replace(/^\/together\/(?!new\b)[^/]+/, '/together/[id]')
      .replace(/^\/chat\/[^/]+/, '/chat/[friendId]')
      .replace(/^\/user\/[^/]+/, '/user/[userId]');
    return u.toString();
  } catch {
    return raw;
  }
}

export async function startAnalytics() {
  if (Platform.OS !== 'web' || started || typeof window === 'undefined') return;
  // Only on the deployed site, not in local development.
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return;
  started = true;
  try {
    const { inject } = await import('@vercel/analytics');
    inject({ beforeSend: event => ({ ...event, url: redactUrl(event.url) }) });
  } catch {}
}
