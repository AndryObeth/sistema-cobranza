import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        name: 'Novedades Cancún - Cobranza',
        short_name: 'Cobranza',
        description: 'Sistema de cobranza Novedades Cancún',
        theme_color: '#1e3a5f',
        background_color: '#f3f4f6',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cachear todos los assets estáticos generados por Vite
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Rutas de navegación (SPA fallback)
        navigateFallback: '/index.html',
        // Cachear respuestas de la API que el cobrador necesita
        runtimeCaching: [
          {
            // GET /api/pagos/todas-cuentas
            urlPattern: ({ url }) => url.pathname.includes('/api/pagos/todas-cuentas'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cuentas',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 }, // 24h
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // GET /api/clientes
            urlPattern: ({ url }) => url.pathname.includes('/api/clientes') && !url.pathname.includes('/importar'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-clientes',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 1, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // GET /api/pagos/cuenta/:id  — detalle de cuenta individual
            urlPattern: ({ url }) => url.pathname.includes('/api/pagos/cuenta/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cuenta-detalle',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 12 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
