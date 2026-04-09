import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // shunature.one/admin/ などのサブパス配信に対応するため /admin/ プレフィックスでビルド
  base: '/admin/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'AirPubre',
        short_name: 'AirPubre',
        description: 'Lightweight Markdown CMS',
        theme_color: '#0ea5e9',
        background_color: '#f0f9ff',
        display: 'standalone',
        scope: '/admin/',
        start_url: '/admin/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst'
          },
          {
            // Transformers.js モデルファイルを PWA キャッシュ（初回のみDL）
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'transformers-model-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 90 }
            }
          },
          {
            urlPattern: /^https:\/\/cdn-lfs\.huggingface\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'transformers-model-cache',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 90 }
            }
          }
        ]
      }
    })
  ],
  build: {
    outDir: 'dist/admin',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          // 重量級ライブラリは個別チャンクに分離して初回ロードを軽くする
          if (id.includes('@xenova/transformers')) return 'transformers'
          if (id.includes('@tiptap'))               return 'tiptap'
          if (id.includes('prosemirror'))           return 'tiptap'
          if (id.includes('highlight.js'))          return 'highlight'
          if (id.includes('marked') || id.includes('turndown') || id.includes('dompurify')) return 'markdown'
          if (id.includes('react') || id.includes('scheduler')) return 'vendor'
        }
      }
    }
  }
})
