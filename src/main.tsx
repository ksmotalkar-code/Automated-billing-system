import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { DataProvider } from './contexts/DataContext.tsx';
import './index.css';
import './i18n';
import { initLogger } from './lib/logger';
import { registerSW } from 'virtual:pwa-register';

initLogger();

// Register Progressive Web App (PWA) with instant auto-update and automatic reload
if ('serviceWorker' in navigator) {
  // 1. Hook into controllerchange. When a new service worker takes over, reload immediately.
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    console.log('[PWA] Service Worker controller changed (New version activated). Reloading page for fresh assets...');
    window.location.reload();
  });

  // 2. Register the service worker via Vite-PWA with instant autoUpdate
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('[PWA] New version of the application found. Applying updates instantly...');
      updateSW(true); // Forces immediate skipWaiting and activation of the new service worker
    },
    onOfflineReady() {
      console.log('[PWA] Application is fully precached and ready to work offline.');
    },
  });

  // 3. Set up background polling and tab-focus checks to bypass native browser delays
  navigator.serviceWorker.ready.then((registration) => {
    console.log('[PWA] Active Service Worker detected. Setting up cache-busting listeners...');

    // A. Check for updates immediately when the user switches tabs / focuses the window
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        console.log('[PWA] App tab focused. Querying server for updates...');
        registration.update().catch(err => console.warn('[PWA] Visibility update check failed:', err));
      }
    });

    // B. Check for updates in the background every 30 seconds
    setInterval(() => {
      if (navigator.onLine) {
        console.log('[PWA] Running periodic server-side update poll...');
        registration.update().catch(err => console.warn('[PWA] Periodic update check failed:', err));
      }
    }, 30000);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TenantProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </TenantProvider>
    </ErrorBoundary>
  </StrictMode>,
);
