import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        allowedHosts: ['.trycloudflare.com'],
      },
      preview: {
        allowedHosts: ['.trycloudflare.com', '.loca.lt'],
      },
      plugins: [react()],
      define: {},
      optimizeDeps: {
        exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks: {
              react: ['react', 'react-dom'],
              supabase: ['@supabase/supabase-js'],
              motion: ['framer-motion'],
              icons: ['lucide-react'],
            },
          },
        },
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
