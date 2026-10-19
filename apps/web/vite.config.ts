import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.join(root, 'src') },
  },
  server: {
    port: 5173,
    // In development the API runs separately; the proxy keeps everything on one origin, exactly
    // as in production where Express serves both (so the session cookie works the same way).
    proxy: { '/api': 'http://localhost:3000' },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
