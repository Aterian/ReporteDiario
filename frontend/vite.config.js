import { readFileSync } from 'node:fs';
import process from 'node:process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));
const edicion = process.env.VITE_APP_EDITION === 'operativa' ? 'operativa' : 'gestion';
const versionApp = (process.env.VITE_APP_VERSION || pkg.version || '0.0.0').trim();

// base: './' permite que la aplicación cargue recursos con rutas relativas
// outDir compila los archivos estáticos directamente dentro de la carpeta backend
export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __APP_EDITION__: JSON.stringify(edicion),
    __APP_VERSION__: JSON.stringify(versionApp),
  },
  build: {
    outDir: '../backend/dist',
    emptyOutDir: true,
  },
});
