// FCM service worker is disabled. All push notifications are handled by sw.js using the standard Web Push API.
        const client = windowClients[i];
        
        try {
          const clientUrl = new URL(client.url);
          if (clientUrl.origin === 'https://walks.wearesparklab.com') {
            return client.focus().then(() => {
              if (client.navigate) {
                return client.navigate('/');
              }
            });
          }
        } catch (e) {
          console.log('Error checking client URL:', e);
        }
      }
      
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    }).catch((error) => {
      console.error('Error handling notification click:', error);
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
