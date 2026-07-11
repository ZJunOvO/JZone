export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return;
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;

  if (import.meta.env.DEV) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => registration.unregister().catch(() => {}));
      }).catch(() => {});
      if ('caches' in window) {
        caches.keys().then((keys) => {
          keys.filter((key) => key.startsWith('jzone-pwa-')).forEach((key) => caches.delete(key).catch(() => {}));
        }).catch(() => {});
      }
    });
    return;
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        registration.update().catch(() => {});
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
};
