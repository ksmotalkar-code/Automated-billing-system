import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TenantProvider } from './contexts/TenantContext.tsx';
import { DataProvider } from './contexts/DataContext.tsx';
import './index.css';
import './i18n';
import { initLogger } from './lib/logger';

initLogger();

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
