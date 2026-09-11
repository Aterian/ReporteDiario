import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' permite que la aplicación cargue recursos con rutas relativas
// outDir compila los archivos estáticos directamente dentro de la carpeta backend
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: '../backend/dist',
    emptyOutDir: true,
  }
});
