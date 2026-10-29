import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  publicDir: false,
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['web-txt2img', '@aislamov/diffusers.js', '@aislamov/onnxruntime-web64'] }
});
