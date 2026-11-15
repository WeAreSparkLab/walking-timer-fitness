// Firebase Cloud Messaging service worker
// Handles background push messages delivered via FCM

importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Activate immediately without waiting for existing tabs to close
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

firebase.initializeApp({
  apiKey: 'AIzaSyD75bGgH-5XM-zVdS77ghEx0p3LAmkm3es',
  authDomain: 'spark-walk.firebaseapp.com',
  projectId: 'spark-walk',
  storageBucket: 'spark-walk.firebasestorage.app',
  messagingSenderId: '293075383902',
  appId: '1:293075383902:web:d3ef6c9f60c7063ecc26cf',
});

const messaging = firebase.messaging();

// Handle background messages (when the app tab is closed or not focused)
messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title || 'Spark Walk';
  const body  = payload.notification?.body  || '';
  const icon  = payload.notification?.icon  || '/icon-192.png';

  return self.registration.showNotification(title, {
    body,
    icon,
    badge: '/icon-192.png',
    data: payload.data || {},
    tag: payload.data?.type || 'fcm-notification',
    requireInteraction: false,
  });
});

// Route notification clicks to the correct in-app path
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let path = '/dashboard';

  if (data.type === 'session_invite' && data.sessionId) {
    path = '/walk-timer?sessionId=' + data.sessionId;
  } else if (data.type === 'friend_request') {
    path = '/friends?tab=requests';
  } else if (data.type === 'friend_accepted') {
    path = '/friends';
  } else if (data.type === 'chat_message' && data.sessionId) {
    path = '/walk-timer?sessionId=' + data.sessionId;
  }

  const targetUrl = self.location.origin + path;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
