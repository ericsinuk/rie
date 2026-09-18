import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/rie/',
  server: {
    allowedHosts: true,
    proxy: {
      '/rie/api': {
        target: 'http://localhost:5555',
        rewrite: path => path.replace(/^\/rie\/api/, ''),
        ws: true,
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'icons/*.png'],
      manifest: {
        name: 'RIE — Rectification Interval Extension',
        short_name: 'RIE',
        description: 'DHL Cargo MEL Rectification Interval Extension Management',
        theme_color: '#FFCC00',
        background_color: '#0f0f0f',
        display: 'standalone',
        start_url: '/rie/',
        scope: '/rie/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' }
          }
        ]
      }
    })
  ]
})
