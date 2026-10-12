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

// Auto-activate any waiting service worker and check for latest applet bundle
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      if (reg.waiting) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }
      reg.update().catch(() => {});
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
