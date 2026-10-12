import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/socket.io': { target: 'http://127.0.0.1:3002', ws: true } },
  },
  preview: { port: 4173, strictPort: true, proxy: { '/socket.io': { target: 'http://127.0.0.1:3002', ws: true } } },
  build: { target: 'es2022' },
});
