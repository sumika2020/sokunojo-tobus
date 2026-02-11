import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // 明示的にホストを許可
    proxy: {
      '/bus-api-v4': {
        target: 'https://api-public.odpt.org/api/v4',
        changeOrigin: true,
        secure: false,
        // プロキシ先をドメイン名ではなくIP直接解決に近い挙動にするための設定
        rewrite: (path) => path.replace(/^\/bus-api-v4/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('Proxy Error:', err);
          });
        }
      }
    }
  }
})