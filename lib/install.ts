// lib/install.ts — "Install Spark Walk" (web app install).
//
// Browsers fire `beforeinstallprompt` once, early, and only some of them
// (Chrome, Edge and other Chromium browsers on Android and desktop). So the
// listener is attached as soon as this module is imported (from the root
// layout), not when a screen mounts, and the event is kept for later.
// iPhone/iPad and other browsers can't be prompted: they get short steps.
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

type DeferredPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallKind =
  | 'hidden'      // native app, or server render
  | 'installed'   // already running as an installed app
  | 'prompt'      // the browser will show its own install dialog
  | 'ios'         // iPhone / iPad: Share → Add to Home Screen
  | 'manual';     // other browsers: use the browser menu

const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';
let deferred: DeferredPrompt | null = null;
let installed = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach(f => f());

function standalone() {
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      (navigator as any).standalone === true
    );
  } catch { return false; }
}

function isIOS() {
  try {
    const ua = navigator.userAgent || '';
    // iPadOS 13+ reports itself as a Mac with a touch screen.
    return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1);
  } catch { return false; }
}

if (isWeb) {
  installed = standalone();
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e as DeferredPrompt;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    notify();
  });
}

export function installKind(): InstallKind {
  if (!isWeb) return 'hidden';
  if (installed || standalone()) return 'installed';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return 'manual';
}

/** Opens the browser's install dialog. Returns what happened. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const p = deferred;
  deferred = null; // the browser only allows one prompt per event
  notify();
  try {
    await p.prompt();
    const { outcome } = await p.userChoice;
    if (outcome === 'accepted') { installed = true; notify(); }
    return outcome;
  } catch {
    return 'unavailable';
  }
}

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force(n => n + 1);
    subs.add(f);
    f(); // pick up an event that arrived before this screen mounted
    return () => { subs.delete(f); };
  }, []);
  return { kind: installKind(), install: promptInstall };
}

/** Plain-language steps for browsers that can't show an install dialog. */
export function manualSteps(kind: InstallKind): string[] {
  if (kind === 'ios') return ['Tap the Share button at the bottom or top of Safari.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add”.'];
  if (kind === 'manual') return ['Open your browser’s menu (⋮ or ⋯).', 'Choose “Install app”, “Add to Home screen” or “Add to Dock”.'];
  return [];
}
