import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // "pruebas" en el ambiente Preview de Vercel (variable AMBIENTE); vacío en producción.
  define: { __AMBIENTE__: JSON.stringify(process.env.AMBIENTE ?? '') },
  build: {
    rollupOptions: {
      input: {
        formulario: resolve(__dirname, 'index.html'),
        panel: resolve(__dirname, 'panel.html'),
        consulta: resolve(__dirname, 'consulta.html'),
        formulario2: resolve(__dirname, 'formulario2.html'),
      },
    },
  },
});
