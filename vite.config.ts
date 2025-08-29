import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy any /recording/* request to your backend
      '/recording': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path, // keep the same path
      },
    },
  },
});
