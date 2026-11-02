import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { DataProvider } from './contexts/DataContext.tsx';
import './index.css';
import './i18n';
import { initLogger } from './lib/logger';
import { PWAUpdateToast } from './components/PWAUpdateToast';

initLogger();

// Auto-activate or clean service worker in preview/development
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const isPreview = window.self !== window.top || window.location.hostname.includes('run.app') || window.location.hostname.includes('localhost');
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;

  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      if (isPreview && !isStandalone) {
        reg.unregister().catch(() => {});
      } else {
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        reg.update().catch(() => {});
      }
    }
  });
}


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <TenantProvider>
        <DataProvider>
          <App />
          <PWAUpdateToast />
        </DataProvider>
      </TenantProvider>
    </ErrorBoundary>
  </StrictMode>,
);
