import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const geminiApiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "";
  const appUrl = env.APP_URL || process.env.APP_URL || env.VITE_APP_URL || process.env.VITE_APP_URL || "";
  const whatsappApiKey = env.VITE_WHATSAPP_API_KEY || process.env.VITE_WHATSAPP_API_KEY || env.WHATSAPP_API_KEY || process.env.WHATSAPP_API_KEY || "";
  const whatsappPhoneId = env.VITE_WHATSAPP_PHONE_NUMBER_ID || process.env.VITE_WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID || "";

  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico.jpg', 'pwa-192x192.svg', 'pwa-512x512.svg', 'vwsc_seal.png'],
        devOptions: {
          enabled: true,
          type: 'module',
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              // Cache Firestore REST / gRPC web calls for customer profiles and billing history offline access
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'firestore-data-cache',
                expiration: {
                  maxEntries: 1000,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
                networkTimeoutSeconds: 5,
              },
            },
            {
              // Cache Firebase Auth endpoints for session persistence
              urlPattern: /^https:\/\/identitytoolkit\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'firebase-auth-cache',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache Google Fonts CSS
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache Google Fonts webfonts
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              // Cache static images, badges, and seals
              urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'images-asset-cache',
                expiration: {
                  maxEntries: 100,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
              },
            },
            {
              // Cache API routes
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'api-routes-cache',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        manifest: {
          id: '/',
          start_url: '/',
          scope: '/',
          name: 'Panchayat Water Billing & Management',
          short_name: 'WaterBill',
          description: 'A powerful automated billing and customer management application for Gram Panchayat with full offline support.',
          theme_color: '#1a202c',
          background_color: '#1a202c',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.svg',
              sizes: '192x192',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any'
            },
            {
              src: 'pwa-512x512.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'maskable'
            }
          ]
        }
      })
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiApiKey),
      'process.env.APP_URL': JSON.stringify(appUrl),
      'process.env.NODE_ENV': JSON.stringify(mode || process.env.NODE_ENV || "production"),
      'import.meta.env.VITE_WHATSAPP_API_KEY': JSON.stringify(whatsappApiKey),
      'import.meta.env.VITE_WHATSAPP_PHONE_NUMBER_ID': JSON.stringify(whatsappPhoneId),
      'import.meta.env.VITE_APP_URL': JSON.stringify(appUrl),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: false,
      minify: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
