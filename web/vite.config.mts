import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5173,
    // Run `ELM327_WEB_TOKEN=dev npx elm327 --web --no-open`, then open http://localhost:5173/?token=dev
    proxy: { '/api': 'http://127.0.0.1:3327' },
  },
});
