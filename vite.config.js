import { defineConfig } from 'vite';

export default defineConfig({
  // Rutas relativas: la carpeta dist/ se puede abrir desde cualquier servidor estático.
  base: './',
  build: {
    // Three.js por sí solo ocupa ~600 kB; no es un problema para esta aplicación.
    chunkSizeWarningLimit: 900,
  },
});
