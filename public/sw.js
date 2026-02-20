// Service Worker for PWA
const CACHE_NAME = 'spark-walk-v2';
const SW_VERSION = '2.0.0';

self.addEventListener('install', (event) => {
  console.log(`Service Worker v${SW_VERSION} installing.`);
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log(`Service Worker v${SW_VERSION} activating.`);
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Let all requests pass through without caching for now
  event.respondWith(fetch(event.request));
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log(`[SW v${SW_VERSION}] Push notification received!`);
  console.log('[SW] Event data exists:', !!event.data);
  
  let notificationData = {
    title: 'New Notification',
    body: 'You have a new notification',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: {}
  };

  // Try to parse the push data
  if (event.data) {
    try {
      const rawText = event.data.text();
      console.log('[SW] Raw push data:', rawText);
      const payload = JSON.parse(rawText);
      console.log('[SW] Parsed payload:', payload);
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        data: payload.data || notificationData.data,
      };
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error);
    }
  }

  console.log('[SW] Showing notification:', notificationData.title, '-', notificationData.body);

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      tag: notificationData.data?.type || 'notification',
      requireInteraction: false,
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Notification clicked:', event.notification.data);
  
  event.notification.close();
  
  const data = event.notification.data || {};
  let urlToOpen = 'https://walks.wearesparklab.com/dashboard';
  
  // Build URL based on notification type
  if (data.type === 'walk_invite' && data.session_id) {
    urlToOpen = `https://walks.wearesparklab.com/walk-timer?sessionId=${data.session_id}`;
  } else if (data.type === 'session_invite' && data.link) {
    urlToOpen = data.link;
  }
  
  console.log('Opening URL:', urlToOpen);
  
  // Open or focus the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window open
      for (const client of clientList) {
        if (client.url.includes('walks.wearesparklab.com') && 'focus' in client) {
          // Just focus and navigate via postMessage instead
          client.focus();
          client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
          return;
        }
      }
      // Open new window if none exists
      return clients.openWindow(urlToOpen);
    })
  );
});
