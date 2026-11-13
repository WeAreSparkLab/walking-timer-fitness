import { messaging } from './firebaseConfig';
import { getToken, onMessage, deleteToken } from 'firebase/messaging';
import { supabase } from './supabaseClient';

const VAPID_KEY = 'BHC2AR4Wmj4t5yHD0Umfu6h0FUduIUPf0eArSaIA8zLiNFEXTT29ru6aMiEqFk_4KmUz_04wMCWRRqRzZBy11t8';
const FCM_SW_PATH = '/firebase-messaging-sw.js';

/**
 * Wait for the FCM service worker to become FULLY ACTIVATED before returning.
 * getToken() requires an 'activated' SW (not just 'activating') so it can
 * access the push subscription. MDN: registration.active returns the SW in
 * 'activating' OR 'activated' state, so we must explicitly check the state.
 */
async function getFCMServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  let registration = await navigator.serviceWorker.getRegistration(FCM_SW_PATH);

  if (!registration) {
    registration = await navigator.serviceWorker.register(FCM_SW_PATH);
  }

  // Return only when fully activated
  if (registration.active?.state === 'activated') return registration;

  return new Promise((resolve) => {
    const checkResolved = () => {
      if (registration!.active?.state === 'activated') {
        resolve(registration!);
        return true;
      }
      return false;
    };

    const attachListener = (sw: ServiceWorker | null) => {
      if (!sw) return;
      sw.addEventListener('statechange', function handler() {
        if (checkResolved()) sw.removeEventListener('statechange', handler);
      });
    };

    // Watch all current SW lifecycle states
    attachListener(registration!.installing);
    attachListener(registration!.waiting);
    attachListener(registration!.active);

    // Also catch future SW updates (e.g. skipWaiting causing a new active SW)
    registration!.addEventListener('updatefound', () => {
      attachListener(registration!.installing);
    });

    // Fallback: resolve after 10 s so we never hang indefinitely
    setTimeout(() => resolve(registration!), 10_000);

    // Re-check immediately in case state changed between getRegistration() and now
    checkResolved();
  });
}

export async function requestNotificationPermission() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Notification permission denied.');
      return null;
    }

    console.log('Notification permission granted.');

    if (!messaging) {
      console.error('Messaging not initialized');
      return null;
    }

    // Ensure FCM service worker is active before calling getToken
    const swRegistration = await getFCMServiceWorkerRegistration();

    const existingSub = await swRegistration.pushManager.getSubscription();

    // Attempt to get the FCM token
    let token: string | null = null;
    try {
      token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: swRegistration,
      }) || null;
    } catch (tokenError: any) {
      console.warn('getToken() failed, clearing stale subscription and retrying:', tokenError?.code);
      // Stale push subscription with wrong VAPID key — clear it and retry
      try {
        await deleteToken(messaging);
        if (existingSub) await existingSub.unsubscribe();
        token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swRegistration,
        }) || null;
      } catch (retryError: any) {
        console.error('getToken() retry also failed:', retryError?.code);
      }
    }

    return token || null;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return null;
  }
}

export async function subscribeFCM(userId: string) {
  const token = await requestNotificationPermission();
  
  if (token) {
    const { error } = await supabase
      .from('fcm_tokens')
      .upsert(
        { user_id: userId, token: token, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,token' }
      );
    
    if (error) {
      console.error('Error storing FCM token:', error);
    }
  }
}

export function listenForMessages() {
  if (messaging) {
    onMessage(messaging, (payload) => {
      if (payload.notification) {
        // Show browser notification even when tab is active
        if (Notification.permission === 'granted') {
          new Notification(payload.notification.title || 'New Message', {
            body: payload.notification.body,
            icon: payload.notification.icon || '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'spark-walk-notification',
            requireInteraction: false
          });
        }
        

      }
    });
  }
}
