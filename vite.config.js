import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import jsconfigPaths from 'vite-jsconfig-paths';

export default defineConfig({
  plugins: [react()],
  build: {
    manifest: true,
  },
  server: {
    proxy: '/api: http://localhost:5000',
    port: 5000,
    open: true,
  },
  preview: {
    port: 5000,
  },
});
