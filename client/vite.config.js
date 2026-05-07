import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: { 
    port: 3000, 
    host: '0.0.0.0', 
    proxy: { 
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3001',
        changeOrigin: true 
      }
    },
    allowedHosts: true 
  },
  preview: {
    port: 3000,
    host: true,
    strictPort: true,
    allowedHosts: [
      'election-client-production.up.railway.app',
      '.up.railway.app'  // Allow all Railway subdomains
    ]
  },
  build: {
    outDir: '../server/public',
    sourcemap: false
  }
});
