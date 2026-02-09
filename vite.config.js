import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
        landing: resolve(__dirname, 'client/landing.html'),
      },
    },
  },
  server: {
    port: 3001,
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true
      }
    }
  }
});
