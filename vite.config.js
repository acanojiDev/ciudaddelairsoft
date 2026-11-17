import { defineConfig } from 'vite';

// Rutas relativas: la web funciona igual en acanojidev.github.io/ciudaddelairsoft/
// que en un dominio propio o en cualquier subcarpeta.
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 800 },
});
