import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Le navigateur voit localhost:5173 comme seule origine — Vite relaie
      // silencieusement vers le backend. C'est ce qui évite tout problème de
      // cookie HttpOnly cross-origin/SameSite en dev (cf. la mise en place de
      // cookie-parser, plus tôt) : le cookie posé par le backend est vu par
      // le navigateur comme venant de la même origine que la page.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
