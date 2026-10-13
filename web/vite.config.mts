import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    port: 5173,
    // Run `ELM327_WEB_TOKEN=dev npx elm327 --web --no-open`, then open http://localhost:5173/?token=dev
    proxy: { '/api': 'http://127.0.0.1:3327' },
  },
});
