import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Served from https://<user>.github.io/10-minutes-to-spare/, so every asset URL
// needs that prefix. Locally `vite dev` sets its own base, so keep it conditional.
const base = process.env.GITHUB_ACTIONS ? '/10-minutes-to-spare/' : '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // Registration is done by src/lib/pwa.js so updates land in one reload.
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: '10 Minutes to Spare',
        short_name: '10 Minutes',
        description:
          'Tiny tasks, ten minutes, real results — a habit tracker for the little things.',
        theme_color: '#2F5C96',
        background_color: '#EFE9D8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The Firebase SDK is its own set of chunks and is only fetched when
        // you actually sign in. Precaching it would put ~800 KB on every
        // install, including for anyone who never turns sync on; the runtime
        // rule below keeps it offline-ready from the first time it is used.
        globIgnores: ['**/index.esm-*.js'],
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\/assets\/index\.esm-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'firebase-sdk',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
});
